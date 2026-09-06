import {
  createHistoricalEffectReview,
  verifyHistoricalEffectReview,
} from "./core/review-record.mjs";
import {
  listHistoricalEffectReviews,
  saveHistoricalEffectReview,
} from "./core/review-store.mjs";
import { listCheckpoints } from "./core/store.mjs";
import { findRepositoryRoot } from "./git/git.mjs";
import { runVerify } from "./verify.mjs";

const HELP = `patchoath review [checkpoint] <decision> [options]

Record or inspect a human review of an already-observed checkpoint effect.
A review is retrospective only: it never changes the Change Contract or grants future agent authority.

Decisions:
  --accept-effect      Record that this exact historical effect is accepted for review purposes
  --reject-effect      Record that this exact historical effect is rejected
  --needs-follow-up    Record that further human review or remediation is required

Actions:
  --list               List stored review records, optionally filtered by checkpoint
  --verify <record>    Verify a review record and its source checkpoint evidence

Options:
  --note <text>        Optional local review rationale
  --reviewer <label>   Optional claimed reviewer label; PatchOath does not verify identity
  --json               Emit machine-readable JSON
  -h, --help           Show help`;

const DECISION_FLAGS = new Map([
  ["--accept-effect", "accept-effect"],
  ["--reject-effect", "reject-effect"],
  ["--needs-follow-up", "needs-follow-up"],
]);

function parse(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    if (
      DECISION_FLAGS.has(token) ||
      token === "--list" ||
      token === "--json" ||
      token === "--help" ||
      token === "-h"
    ) {
      options[token] = true;
      continue;
    }
    if (["--note", "--reviewer", "--verify"].includes(token)) {
      const value = argv[++index];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${token} requires a value.`);
      }
      options[token] = value;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  if (positionals.length > 1) {
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  }
  return { checkpoint: positionals[0] || null, options };
}

function resolveCheckpoint(checkpoints, token) {
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
  if (matches.length > 1) {
    throw new Error(`Checkpoint prefix ${token} is ambiguous.`);
  }
  return matches[0];
}

function resolveReview(records, token) {
  const matches = records.filter(
    (record) => record.recordId === token || record.recordId.startsWith(token),
  );
  if (matches.length === 0)
    throw new Error(`Review record ${token} was not found.`);
  if (matches.length > 1) {
    throw new Error(`Review record prefix ${token} is ambiguous.`);
  }
  return matches[0];
}

function memoryStream() {
  let text = "";
  return {
    write(value) {
      text += String(value);
    },
    value() {
      return text;
    },
  };
}

async function verifySourceEvidence(root, checkpoint) {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const code = await runVerify([checkpoint.id, "--json"], {
    cwd: root,
    stdout,
    stderr,
  });
  if (code === 0) return JSON.parse(stdout.value());

  let result = null;
  try {
    result = stdout.value() ? JSON.parse(stdout.value()) : null;
  } catch {
    result = null;
  }
  return {
    valid: false,
    reason: result?.reason || "source-verification-failed",
    checkpointId: checkpoint.id,
    stderr: stderr.value().trim() || null,
  };
}

function selectedDisposition(options) {
  const selected = [...DECISION_FLAGS.entries()].filter(
    ([flag]) => options[flag],
  );
  if (selected.length === 0) return null;
  if (selected.length > 1) {
    throw new Error("Choose exactly one review decision.");
  }
  return selected[0][1];
}

export async function runReview(argv = process.argv.slice(3), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }

  if (parsed.options["--help"] || parsed.options["-h"]) {
    stdout.write(`${HELP}\n`);
    return 0;
  }

  try {
    const root = findRepositoryRoot(io.cwd || process.cwd());
    const checkpoints = await listCheckpoints(root);

    if (parsed.options["--list"]) {
      if (parsed.options["--verify"] || selectedDisposition(parsed.options)) {
        throw new Error(
          "--list cannot be combined with a review decision or --verify.",
        );
      }
      let records = await listHistoricalEffectReviews(root);
      if (parsed.checkpoint) {
        const checkpoint = resolveCheckpoint(checkpoints, parsed.checkpoint);
        records = records.filter(
          (record) => record.checkpointId === checkpoint.id,
        );
      }
      if (parsed.options["--json"]) {
        stdout.write(`${JSON.stringify(records, null, 2)}\n`);
      } else if (records.length === 0) {
        stdout.write("no historical effect review records\n");
      } else {
        for (const record of records) {
          stdout.write(
            `${record.recordId}  ${record.disposition}  ${record.checkpointId}  ${record.recordedAt}\n`,
          );
        }
      }
      return 0;
    }

    if (parsed.options["--verify"]) {
      if (parsed.checkpoint || selectedDisposition(parsed.options)) {
        throw new Error(
          "--verify accepts a review record ID and no review decision.",
        );
      }
      const record = resolveReview(
        await listHistoricalEffectReviews(root),
        parsed.options["--verify"],
      );
      const checkpoint = resolveCheckpoint(checkpoints, record.checkpointId);
      const recordIntegrity = verifyHistoricalEffectReview(record, checkpoint);
      const sourceEvidence = await verifySourceEvidence(root, checkpoint);
      const valid = recordIntegrity.valid && sourceEvidence.valid;
      const result = {
        valid,
        reason: !recordIntegrity.valid
          ? recordIntegrity.reason
          : sourceEvidence.valid
            ? "verified"
            : sourceEvidence.reason,
        record,
        recordIntegrity,
        sourceEvidence,
        authorityBoundary: {
          historicalEffectOnly: true,
          changeContractMutated: false,
          futureAuthorityGranted: false,
        },
      };
      if (parsed.options["--json"]) {
        stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        stdout.write(`${valid ? "verified" : "failed"} ${record.recordId}\n`);
        stdout.write(`source   ${record.sourceReceiptId}\n`);
        stdout.write(`decision ${record.disposition}\n`);
        stdout.write(
          "authority historical effect only · Change Contract unchanged · no future authority granted\n",
        );
        if (!valid) stdout.write(`reason   ${result.reason}\n`);
      }
      return valid ? 0 : 2;
    }

    const disposition = selectedDisposition(parsed.options);
    if (!disposition) {
      throw new Error(
        "Choose --accept-effect, --reject-effect, --needs-follow-up, --list, or --verify.",
      );
    }

    const checkpoint = resolveCheckpoint(checkpoints, parsed.checkpoint);
    const sourceEvidence = await verifySourceEvidence(root, checkpoint);
    if (!sourceEvidence.valid) {
      if (parsed.options["--json"]) {
        stdout.write(
          `${JSON.stringify(
            {
              created: false,
              reason: "source-evidence-not-verified",
              sourceEvidence,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        stdout.write(`refused  ${checkpoint.id}\n`);
        stdout.write(
          `reason   source evidence did not verify (${sourceEvidence.reason})\n`,
        );
      }
      return 2;
    }

    const record = createHistoricalEffectReview({
      checkpoint,
      disposition,
      note: parsed.options["--note"],
      reviewerLabel: parsed.options["--reviewer"],
    });
    await saveHistoricalEffectReview(root, record);

    const result = {
      created: true,
      record,
      sourceEvidence: {
        valid: true,
        reason: sourceEvidence.reason,
        checkpointId: checkpoint.id,
        receiptId: checkpoint.receipt.receiptId,
        coverage: sourceEvidence.receipt?.coverage || null,
      },
      authorityBoundary: {
        historicalEffectOnly: true,
        changeContractMutated: false,
        futureAuthorityGranted: false,
      },
      reviewerIdentityVerified: false,
    };

    if (parsed.options["--json"]) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stdout.write(`recorded  ${record.recordId}\n`);
      stdout.write(`effect    ${record.disposition}\n`);
      stdout.write(`source    ${record.sourceReceiptId}\n`);
      if (record.reviewerLabel) {
        stdout.write(
          `reviewer  ${record.reviewerLabel} (claimed label; identity not verified)\n`,
        );
      }
      stdout.write(
        "authority historical effect only · Change Contract unchanged · no future authority granted\n",
      );
    }
    return 0;
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
}
