import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  createDisclosureCapsule,
  createDisclosurePolicy,
  verifyDisclosureCapsule,
} from "./core/disclosure.mjs";
import { listCheckpoints, storePaths } from "./core/store.mjs";
import { findRepositoryRoot } from "./git/git.mjs";

const HELP = `patchoath capsule [checkpoint] [options]
patchoath capsule --verify <file> [--json]

Create a privacy-first Evidence Capsule from a completed checkpoint. By default the capsule omits prompt text, file paths, contract patterns, source patches, and visual artifact bytes while preserving a link to the source Evidence Receipt.

Options:
  --out <file>           Write to a specific path
  --include-prompt       Include the full prompt text
  --include-paths        Include changed relative file paths
  --include-contract     Include full change-contract patterns
  --verify <file>        Verify a capsule's Disclosure Receipt and disclosure policy
  --json                 Emit machine-readable output
  -h, --help             Show help`;

function parse(argv) {
  const options = {
    json: false,
    includePrompt: false,
    includePaths: false,
    includeContract: false,
    out: null,
    verify: null,
    help: false,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") options.json = true;
    else if (token === "--include-prompt") options.includePrompt = true;
    else if (token === "--include-paths") options.includePaths = true;
    else if (token === "--include-contract") options.includeContract = true;
    else if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--out" || token === "--verify") {
      const value = argv[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${token} requires a value.`);
      options[token === "--out" ? "out" : "verify"] = value;
    } else if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    } else {
      positionals.push(token);
    }
  }

  if (positionals.length > 1)
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  if (
    options.verify &&
    (positionals.length > 0 ||
      options.out ||
      options.includePrompt ||
      options.includePaths ||
      options.includeContract)
  ) {
    throw new Error(
      "--verify cannot be combined with capsule creation options.",
    );
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
  if (matches.length > 1)
    throw new Error(`Checkpoint prefix ${token} is ambiguous.`);
  return matches[0];
}

async function verifyFile(path, stdout, json) {
  const capsule = JSON.parse(await readFile(resolve(path), "utf8"));
  const verification = verifyDisclosureCapsule(capsule);
  if (json) {
    stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  } else {
    stdout.write("\n");
    stdout.write(
      `✦ PatchOath disclosure ${verification.valid ? "VERIFIED" : "FAILED"}\n`,
    );
    stdout.write(`  reason   ${verification.reason}\n`);
    stdout.write(
      `  drift    ${verification.audit.disclosureDrift ? "DETECTED" : "none"}\n`,
    );
  }
  return verification.valid ? 0 : 2;
}

export async function runCapsule(
  argv,
  {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  try {
    const { checkpoint: token, options } = parse(argv);
    if (options.help) {
      stdout.write(`${HELP}\n`);
      return 0;
    }
    if (options.verify)
      return await verifyFile(options.verify, stdout, options.json);

    const root = findRepositoryRoot(cwd);
    const checkpoint = resolveCheckpoint(await listCheckpoints(root), token);
    const policy = createDisclosurePolicy({
      includePrompt: options.includePrompt,
      includePaths: options.includePaths,
      includeContract: options.includeContract,
    });
    const capsule = createDisclosureCapsule(checkpoint, policy);
    const defaultDirectory = join(storePaths(root).directory, "capsules");
    const outputPath = options.out
      ? isAbsolute(options.out)
        ? options.out
        : join(root, options.out)
      : join(defaultDirectory, `${checkpoint.id}.capsule.json`);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(capsule, null, 2)}\n`,
      "utf8",
    );

    const result = {
      path: outputPath,
      checkpointId: checkpoint.id,
      sourceEvidenceReceiptId: checkpoint.receipt.receiptId,
      disclosureReceiptId: capsule.disclosureReceipt.receiptId,
      omitted: capsule.disclosure.omitted,
      policy: capsule.disclosure.policy,
    };
    if (options.json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stdout.write("\n");
      stdout.write(`✦ PatchOath Evidence Capsule ${checkpoint.id}\n`);
      stdout.write(`  output    ${outputPath}\n`);
      stdout.write(`  source    ${checkpoint.receipt.receiptId}\n`);
      stdout.write(`  disclosure ${capsule.disclosureReceipt.receiptId}\n`);
      stdout.write(
        `  omitted   ${capsule.disclosure.omitted.join(", ") || "none"}\n`,
      );
      stdout.write(
        "  note      minimum disclosure is the default; expanded fields require explicit flags\n",
      );
    }
    return 0;
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
}
