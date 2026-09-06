#!/usr/bin/env node

import { BRAND_NAME, CLI_NAME, TAGLINE, VERSION } from "../src/core/brand.mjs";

const HELP = `${BRAND_NAME} ${VERSION} — ${TAGLINE}\n\nUsage:\n  ${CLI_NAME} init\n  ${CLI_NAME} checkpoint --prompt "Change the primary button color" [contract options]\n  ${CLI_NAME} checkpoint --finish\n  ${CLI_NAME} diff [checkpoint] [--json] [--patch]\n  ${CLI_NAME} attest --prompt "…" [contract options]\n  ${CLI_NAME} verify [checkpoint] [--json]\n  ${CLI_NAME} contract-delta [checkpoint] [--json]\n  ${CLI_NAME} review [checkpoint] --accept-effect|--reject-effect|--needs-follow-up\n  ${CLI_NAME} capsule [checkpoint] [options]\n  ${CLI_NAME} replay [--json]\n  ${CLI_NAME} session [new] [--name "…"] [--json]\n  ${CLI_NAME} report [checkpoint] [--open]\n  ${CLI_NAME} restore [checkpoint] [--apply] [--json]\n\nChange Contract options:\n  --allow <glob,...>             Paths the change may touch\n  --deny <glob,...>              Paths the change must not touch\n  --protect-surface <names,...>  Sensitive deterministic repository surfaces\n  --max-files <n>                Maximum changed files\n  --max-lines <n>                Maximum inserted + deleted lines\n  --max-modules <n>              Maximum touched modules\n\nTrust boundary:\n  Intent is context, not permission. Historical review is not future authority.\n  A full local report is not automatically safe to disclose.\n\nOptions:\n  -h, --help       Show this help\n  -v, --version    Show the PatchOath version`;

function contractArguments(argv) {
  const supported = new Set([
    "--allow",
    "--deny",
    "--protect-surface",
    "--max-files",
    "--max-lines",
    "--max-modules",
  ]);
  const clean = [];
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [name, inline] = token.split(/=(.*)/su, 2);
    if (!supported.has(name)) {
      clean.push(token);
      continue;
    }
    const value = inline === undefined ? argv[++index] : inline;
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    values[name] = value;
  }

  return { clean, values };
}

async function applyCheckpointContract(argv) {
  if (argv[0] !== "checkpoint") return argv;
  const { clean, values } = contractArguments(argv);
  const hasContract = Object.keys(values).length > 0;
  if (!hasContract) return clean;

  if (clean.includes("--finish") || clean.includes("--abort")) {
    throw new Error(
      "Declare change-contract options when starting a checkpoint, not when finishing it.",
    );
  }

  const { createChangeContract, setRuntimeChangeContract } =
    await import("../src/core/contract.mjs");
  const contract = createChangeContract({
    allow: values["--allow"],
    deny: values["--deny"],
    protectedSurfaces: values["--protect-surface"],
    maxFiles: values["--max-files"],
    maxLines: values["--max-lines"],
    maxModules: values["--max-modules"],
  });
  setRuntimeChangeContract(contract);
  return clean;
}

async function runInit(stdout) {
  const { findRepositoryRoot } = await import("../src/git/git.mjs");
  const { initializeStore } = await import("../src/core/store.mjs");
  const root = findRepositoryRoot(process.cwd());
  const result = await initializeStore(root);
  const suffix = result.legacyStore
    ? " (legacy compatibility store; evidence is not rewritten)"
    : " (kept local through .git/info/exclude)";
  stdout.write(
    `${result.created ? "initialized" : "ready"} ${result.paths.directoryName}/${suffix}\n`,
  );
  return 0;
}

async function dispatch(topLevel, io) {
  if (topLevel.length === 1 && ["--version", "-v"].includes(topLevel[0])) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (
    topLevel.length === 0 ||
    (topLevel.length === 1 && ["--help", "-h"].includes(topLevel[0]))
  ) {
    io.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (topLevel.length === 1 && topLevel[0] === "init") {
    return runInit(io.stdout);
  }
  if (topLevel[0] === "attest") {
    const { runAttest } = await import("../src/attest.mjs");
    return runAttest(topLevel.slice(1), io);
  }
  if (topLevel[0] === "verify") {
    const { runVerify } = await import("../src/verify.mjs");
    return runVerify(topLevel.slice(1), io);
  }
  if (topLevel[0] === "restore") {
    const { runRestore } = await import("../src/restore.mjs");
    return runRestore(topLevel.slice(1), io);
  }
  if (topLevel[0] === "capsule") {
    const { runCapsule } = await import("../src/capsule.mjs");
    return runCapsule(topLevel.slice(1), io);
  }
  if (topLevel[0] === "contract-delta") {
    const { runContractDelta } = await import("../src/contract-delta.mjs");
    return runContractDelta(topLevel.slice(1), io);
  }
  if (topLevel[0] === "review") {
    const { runReview } = await import("../src/review.mjs");
    return runReview(topLevel.slice(1), io);
  }

  const argv = await applyCheckpointContract(topLevel);
  const { runCli } = await import("../src/cli.mjs");
  return runCli(argv, io);
}

const io = { stdout: process.stdout, stderr: process.stderr };
const topLevel = process.argv.slice(2);

try {
  const { classifyMutationOperation, withMutationLock } =
    await import("../src/core/mutation-lock.mjs");
  const operation = classifyMutationOperation(topLevel);
  if (!operation) {
    process.exitCode = await dispatch(topLevel, io);
  } else {
    const { findRepositoryRoot } = await import("../src/git/git.mjs");
    const root = findRepositoryRoot(process.cwd());
    process.exitCode = await withMutationLock(root, operation, () =>
      dispatch(topLevel, io),
    );
  }
} catch (error) {
  io.stderr.write(`error ${error.message}\n`);
  process.exitCode = 1;
}
