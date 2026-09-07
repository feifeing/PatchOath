import { checkpointRefCandidates } from "./core/brand.mjs";
import { verifyEvidenceReceipt } from "./core/receipt.mjs";
import { listCheckpoints, loadStore } from "./core/store.mjs";
import { findRepositoryRoot, runGit } from "./git/git.mjs";
import { applyRestore, inspectRestore } from "./git/restore.mjs";

const HELP = `PatchOath restore — safely preview or restore a completed checkpoint

Usage:
  patchoath restore [checkpoint]
  patchoath restore [checkpoint] --apply
  patchoath restore [checkpoint] --json

Restore is dry-run by default. PatchOath only trusts a restore source when its Evidence Receipt
and before/after snapshot refs still verify, and only applies when the current worktree still
matches the checkpoint after-state exactly. If later edits are detected, restore is blocked.
The real Git index and HEAD are not rewritten.`;

function parse(argv) {
  const options = { apply: false, json: false };
  const positionals = [];
  for (const token of argv) {
    if (token === "--apply") options.apply = true;
    else if (token === "--json") options.json = true;
    else if (["--help", "-h"].includes(token)) options.help = true;
    else if (token.startsWith("-"))
      throw new Error(`Unknown restore option: ${token}`);
    else positionals.push(token);
  }
  if (positionals.length > 1)
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  return { ...options, checkpoint: positionals[0] || null };
}

async function resolveCompletedCheckpoint(root, token) {
  const completed = (await listCheckpoints(root)).filter(
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

function trustedSnapshotRefs(checkpoint, phase) {
  return checkpointRefCandidates(checkpoint, phase).filter(
    (ref) =>
      typeof ref === "string" &&
      (ref.startsWith("refs/patchoath/") || ref.startsWith("refs/vibetrace/")),
  );
}

function verifyRestoreSnapshot(root, checkpoint, phase) {
  const commit = checkpoint[phase]?.commit;
  if (!commit) {
    return { valid: false, reason: `${phase}-commit-missing`, ref: null };
  }

  try {
    runGit(root, ["cat-file", "-e", `${commit}^{commit}`]);
  } catch {
    return { valid: false, reason: `${phase}-git-object-missing`, ref: null };
  }

  let mismatchRef = null;
  for (const ref of trustedSnapshotRefs(checkpoint, phase)) {
    try {
      const actual = runGit(root, ["rev-parse", "--verify", ref]).trim();
      if (actual === commit) return { valid: true, reason: "verified", ref };
      mismatchRef ||= ref;
    } catch {
      // A later canonical/legacy candidate may still be present.
    }
  }

  return {
    valid: false,
    reason: mismatchRef ? `${phase}-git-ref-mismatch` : `${phase}-git-ref-missing`,
    ref: mismatchRef,
  };
}

function assertRestoreSourceIntegrity(root, checkpoint) {
  const receipt = verifyEvidenceReceipt(checkpoint);
  if (!receipt.valid) {
    throw new Error(
      `Restore source Evidence Receipt did not verify (${receipt.reason}).`,
    );
  }

  for (const phase of ["before", "after"]) {
    const snapshot = verifyRestoreSnapshot(root, checkpoint, phase);
    if (!snapshot.valid) {
      throw new Error(
        `Restore source snapshot did not verify (${snapshot.reason}).`,
      );
    }
  }
}

function fileSummary(files) {
  return files.map((file) => ({
    path: file.path,
    oldPath: file.oldPath || null,
    additions: file.additions,
    deletions: file.deletions,
    binary: Boolean(file.binary),
  }));
}

function printPlan(plan, stdout) {
  stdout.write("\n");
  stdout.write(`✦ PatchOath guarded restore ${plan.checkpointId}\n`);
  stdout.write(
    `  status       ${plan.canApply ? "READY" : "BLOCKED BY DRIFT"}\n`,
  );
  stdout.write(
    `  drift        ${plan.drift.length} file(s) since checkpoint completion\n`,
  );
  stdout.write(`  restore      ${plan.restore.length} file(s) would change\n`);
  for (const file of plan.restore) {
    const rename = file.oldPath ? `${file.oldPath} → ` : "";
    stdout.write(`  - ${rename}${file.path}\n`);
  }
  if (!plan.canApply) {
    stdout.write(
      "  current worktree differs from the checkpoint after-state:\n",
    );
    for (const file of plan.drift) stdout.write(`  ! ${file.path}\n`);
  }
  stdout.write("\n");
}

export async function runRestore(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const options = parse(argv);
  if (options.help) {
    stdout.write(`${HELP}\n`);
    return 0;
  }

  const root = findRepositoryRoot(io.cwd || process.cwd());
  const { state } = await loadStore(root);
  if (state.activeCheckpointId) {
    throw new Error(
      `Checkpoint ${state.activeCheckpointId} is still recording. Finish or abort it before restore.`,
    );
  }

  const checkpoint = await resolveCompletedCheckpoint(root, options.checkpoint);
  assertRestoreSourceIntegrity(root, checkpoint);
  const headBefore = runGit(root, ["rev-parse", "HEAD"]);
  const indexBefore = runGit(root, ["write-tree"]);
  const plan = await inspectRestore(root, checkpoint);

  const result = {
    checkpointId: plan.checkpointId,
    dryRun: !options.apply,
    canApply: plan.canApply,
    drift: fileSummary(plan.drift),
    restore: fileSummary(plan.restore),
    from: plan.from,
    to: plan.to,
  };

  if (!options.apply) {
    if (options.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      printPlan(plan, stdout);
      stdout.write(
        `${plan.canApply ? "dry-run only; run the same command with --apply to restore" : "restore is blocked until the later worktree drift is resolved"}\n`,
      );
    }
    return plan.canApply ? 0 : 2;
  }

  if (!plan.canApply) {
    if (options.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printPlan(plan, stdout);
    return 2;
  }

  const applied = await applyRestore(root, plan);
  const headAfter = runGit(root, ["rev-parse", "HEAD"]);
  const indexAfter = runGit(root, ["write-tree"]);
  if (headAfter !== headBefore || indexAfter !== indexBefore) {
    throw new Error(
      "Restore safety invariant failed: HEAD or the real Git index changed.",
    );
  }

  const output = {
    ...result,
    dryRun: false,
    applied: true,
    verification: applied.verification,
  };
  if (options.json) stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  else {
    printPlan(plan, stdout);
    stdout.write(
      "restored worktree to the checkpoint before-state; HEAD and index unchanged\n",
    );
  }
  return 0;
}

export { HELP as RESTORE_HELP };
