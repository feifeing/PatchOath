import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { checkpointRefCandidates } from "./core/brand.mjs";
import { verifyEvidenceReceipt } from "./core/receipt.mjs";
import { listCheckpoints } from "./core/store.mjs";
import { findRepositoryRoot, runGit } from "./git/git.mjs";

const HELP = `patchoath verify [checkpoint] [--json]\n\nRecompute a completed checkpoint's Evidence Receipt and verify referenced Git/visual evidence when present.\nThe command exits 0 when evidence verifies and 2 when metadata, Git evidence, or artifact evidence no longer matches. Receipt coverage is versioned; pre-v0.3 receipts and refs remain verifiable with their original scope.\n\nOptions:\n  --json     Emit machine-readable verification output\n  -h, --help Show help`;

function parse(argv) {
  const options = new Set();
  const positionals = [];
  for (const token of argv) {
    if (token === "--json" || token === "--help" || token === "-h") {
      options.add(token);
      continue;
    }
    if (token.startsWith("-")) throw new Error(`Unknown option: ${token}`);
    positionals.push(token);
  }
  if (positionals.length > 1)
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  return { checkpoint: positionals[0] || null, options };
}

function resolve(checkpoints, token) {
  const completed = checkpoints.filter(
    (checkpoint) => checkpoint.status === "completed",
  );
  if (!token) {
    if (!completed[0]) throw new Error("No completed checkpoint exists yet.");
    return completed[0];
  }
  const matches = completed.filter(
    (checkpoint) => checkpoint.id === token || checkpoint.id.startsWith(token),
  );
  if (matches.length === 0)
    throw new Error(`Checkpoint ${token} was not found.`);
  if (matches.length > 1)
    throw new Error(`Checkpoint prefix ${token} is ambiguous.`);
  return matches[0];
}

async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveSnapshotRef(root, checkpoint, phase, commit) {
  const candidates = checkpointRefCandidates(checkpoint, phase);
  let firstMissing = candidates[0] || null;
  for (const ref of candidates) {
    try {
      const actualRef = runGit(root, ["rev-parse", "--verify", ref]).trim();
      return {
        ref,
        actualRef,
        refStatus: actualRef === commit ? "verified" : "mismatch",
        candidates,
      };
    } catch {
      firstMissing ||= ref;
    }
  }
  return {
    ref: firstMissing,
    actualRef: null,
    refStatus: "missing",
    candidates,
  };
}

function verifyGitEvidence(root, checkpoint) {
  const checks = [];
  for (const phase of ["before", "after"]) {
    const commit = checkpoint[phase]?.commit;
    if (!commit) continue;

    let objectStatus = "verified";
    try {
      runGit(root, ["cat-file", "-e", `${commit}^{commit}`]);
    } catch {
      objectStatus = "missing";
    }

    const refResult = resolveSnapshotRef(root, checkpoint, phase, commit);
    checks.push({
      phase,
      commit,
      objectStatus,
      ref: refResult.ref,
      refCandidates: refResult.candidates,
      actualRef: refResult.actualRef,
      refStatus: refResult.refStatus,
    });
  }
  return checks;
}

async function verifyVisualArtifacts(root, checkpoint) {
  const checks = [];
  for (const phase of ["before", "after"]) {
    const capture = checkpoint.visual?.[phase];
    if (!capture?.image || !capture?.imageSha256) continue;
    const path = isAbsolute(capture.image)
      ? capture.image
      : join(root, capture.image);
    try {
      const actualSha256 = await sha256File(path);
      checks.push({
        phase,
        path: capture.image,
        expectedSha256: capture.imageSha256,
        actualSha256,
        status: actualSha256 === capture.imageSha256 ? "verified" : "mismatch",
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      checks.push({
        phase,
        path: capture.image,
        expectedSha256: capture.imageSha256,
        actualSha256: null,
        status: "missing",
      });
    }
  }
  return checks;
}

function verificationReason(receipt, gitEvidence, artifacts) {
  if (!receipt.valid) return receipt.reason;
  if (gitEvidence.some((item) => item.objectStatus === "missing"))
    return "git-object-missing";
  if (gitEvidence.some((item) => item.refStatus === "missing"))
    return "git-ref-missing";
  if (gitEvidence.some((item) => item.refStatus === "mismatch"))
    return "git-ref-mismatch";
  if (artifacts.some((artifact) => artifact.status === "missing"))
    return "artifact-missing";
  if (artifacts.some((artifact) => artifact.status === "mismatch"))
    return "artifact-mismatch";
  return "verified";
}

function writeCoverage(stdout, receipt) {
  const coverage = receipt.coverage;
  if (!coverage) return;
  if (coverage.evidenceVersion === 1) {
    stdout.write(
      "coverage legacy-v1 · file manifest / intent analysis / visual analysis not bound\n",
    );
    return;
  }
  stdout.write(`coverage ${coverage.scope}\n`);
}

export async function runVerify(argv = process.argv.slice(3), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }

  if (parsed.options.has("--help") || parsed.options.has("-h")) {
    stdout.write(`${HELP}\n`);
    return 0;
  }

  try {
    const root = findRepositoryRoot(io.cwd || process.cwd());
    const checkpoint = resolve(await listCheckpoints(root), parsed.checkpoint);
    const receipt = verifyEvidenceReceipt(checkpoint);
    const gitEvidence = verifyGitEvidence(root, checkpoint);
    const artifacts = await verifyVisualArtifacts(root, checkpoint);
    const reason = verificationReason(receipt, gitEvidence, artifacts);
    const valid = reason === "verified";
    const result = {
      checkpointId: checkpoint.id,
      valid,
      reason,
      receipt,
      gitEvidence,
      artifacts,
    };

    if (parsed.options.has("--json")) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (valid) {
      stdout.write(`verified ${checkpoint.id}\n`);
      stdout.write(`receipt  ${receipt.actualReceiptId}\n`);
      writeCoverage(stdout, receipt);
      if (gitEvidence.length > 0)
        stdout.write(
          `git      ${gitEvidence.length} snapshot ref(s) verified\n`,
        );
      if (artifacts.length > 0)
        stdout.write(`artifacts ${artifacts.length} visual file(s) verified\n`);
      stdout.write("evidence matches the stored receipt\n");
    } else {
      stdout.write(`failed   ${checkpoint.id}\n`);
      stdout.write(`reason   ${reason}\n`);
      if (receipt.actualReceiptId)
        stdout.write(`stored   ${receipt.actualReceiptId}\n`);
      if (receipt.expectedReceiptId)
        stdout.write(`current  ${receipt.expectedReceiptId}\n`);
      writeCoverage(stdout, receipt);
      for (const item of gitEvidence.filter(
        (candidate) =>
          candidate.objectStatus !== "verified" ||
          candidate.refStatus !== "verified",
      )) {
        stdout.write(
          `git ${item.phase} object=${item.objectStatus} ref=${item.refStatus} ${item.ref}\n`,
        );
      }
      for (const artifact of artifacts.filter(
        (candidate) => candidate.status !== "verified",
      )) {
        stdout.write(
          `artifact ${artifact.phase} ${artifact.status} ${artifact.path}\n`,
        );
      }
    }
    return valid ? 0 : 2;
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
}
