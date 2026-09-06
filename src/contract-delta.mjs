import { computeObservedContractDelta } from "./core/contract-delta.mjs";
import { listCheckpoints } from "./core/store.mjs";
import { collectCommitDiff } from "./git/diff.mjs";
import { findRepositoryRoot } from "./git/git.mjs";

const HELP = `patchoath contract-delta [checkpoint] [--json]

Compute the restricted local Change-Contract delta that would be sufficient for the selected checkpoint's already-observed effect, without applying or persisting any permission change.

The observed effect is recomputed from the checkpoint's before/after Git objects rather than trusted from cached analysis. The proposal vocabulary is intentionally narrow: exact observed file grants and budget increases to observed totals. Explicit deny rules and protected surfaces are never relaxed automatically.

Options:
  --json      Emit machine-readable output
  -h, --help  Show help`;

function parse(argv) {
  let json = false;
  let help = false;
  const positionals = [];
  for (const token of argv) {
    if (token === "--json") json = true;
    else if (token === "--help" || token === "-h") help = true;
    else if (token.startsWith("-")) throw new Error(`Unknown option: ${token}`);
    else positionals.push(token);
  }
  if (positionals.length > 1)
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  return { token: positionals[0] || null, json, help };
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
  if (matches.length > 1)
    throw new Error(`Checkpoint prefix ${token} is ambiguous.`);
  return matches[0];
}

function printHuman(stdout, result) {
  stdout.write("\n");
  stdout.write(`✦ PatchOath contract delta ${result.checkpointId}\n`);
  stdout.write(`  status     ${result.status}\n`);
  if (result.status === "not-applicable") {
    stdout.write(`  reason     ${result.reason}\n`);
    return;
  }
  stdout.write(
    `  observed   ${result.observed.files} files · ${result.observed.lines} lines · ${result.observed.modules} modules\n`,
  );
  for (const grant of result.delta.exactAllowAdditions) {
    stdout.write(
      `  allow +    ${grant.path}${grant.representable ? "" : " [cannot safely express as exact glob]"}\n`,
    );
  }
  for (const budget of Object.values(result.delta.budgets).filter(Boolean)) {
    stdout.write(
      `  budget     ${budget.field}: ${budget.from} → ${budget.to}\n`,
    );
  }
  for (const blocker of result.blockers) {
    stdout.write(`  review     ${blocker.id}\n`);
  }
  if (result.counterfactual) {
    stdout.write(`  replay     ${result.counterfactual.status}\n`);
  }
  stdout.write(`  receipt    ${result.proposalReceipt.receiptId}\n`);
  stdout.write(
    "  note       proposal only; PatchOath does not apply or persist authorization changes\n",
  );
}

export async function runContractDelta(
  argv,
  {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  try {
    const options = parse(argv);
    if (options.help) {
      stdout.write(`${HELP}\n`);
      return 0;
    }
    const root = findRepositoryRoot(cwd);
    const checkpoint = resolveCheckpoint(
      await listCheckpoints(root),
      options.token,
    );
    const observedFiles = collectCommitDiff(
      root,
      checkpoint.before.commit,
      checkpoint.after.commit,
    );
    const result = computeObservedContractDelta(checkpoint, observedFiles);
    if (options.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printHuman(stdout, result);
    return ["human-review-required", "incomplete-proposal"].includes(
      result.status,
    )
      ? 2
      : 0;
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
}
