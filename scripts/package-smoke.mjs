import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
const git = process.platform === "win32" ? "git.exe" : "git";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runNpm(args, options = {}) {
  if (!npmCli) {
    throw new Error(
      "Package smoke requires npm_execpath from an npm-run context.",
    );
  }
  return run(process.execPath, [npmCli, ...args], options);
}

function runCli(cli, cwd, args) {
  return run(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function normalizeTextForGitComparison(value) {
  return value.replaceAll("\r\n", "\n");
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "patchoath-package-smoke-"));

try {
  const packDirectory = join(temporaryRoot, "pack");
  await mkdir(packDirectory, { recursive: true });
  const packOutput = JSON.parse(
    runNpm(["pack", "--json", "--pack-destination", packDirectory], {
      cwd: root,
    }),
  );
  assert.equal(
    packOutput.length,
    1,
    "npm pack should produce exactly one tarball",
  );

  const packed = packOutput[0];
  const paths = packed.files.map((file) => file.path);
  for (const required of [
    "package.json",
    "bin/patchoath.mjs",
    "bin/vibetrace.mjs",
    "src/cli.mjs",
    "README.md",
    "LICENSE",
    "LEGAL.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.ok(paths.includes(required), `package is missing ${required}`);
  }
  for (const forbiddenPrefix of [
    ".github/",
    ".patchoath/",
    ".vibetrace/",
    "e2e/",
    "scripts/",
    "test/",
    "test-support/",
  ]) {
    assert.ok(
      !paths.some((path) => path.startsWith(forbiddenPrefix)),
      `package unexpectedly contains ${forbiddenPrefix}`,
    );
  }

  const tarball = join(packDirectory, packed.filename);
  const consumer = join(temporaryRoot, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify(
      { name: "patchoath-package-consumer", private: true },
      null,
      2,
    ),
    "utf8",
  );
  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    { cwd: consumer },
  );

  const installedRoot = join(consumer, "node_modules", "patchoath");
  const cli = join(installedRoot, "bin", "patchoath.mjs");
  const legacyCli = join(installedRoot, "bin", "vibetrace.mjs");
  assert.equal(runCli(cli, consumer, ["--version"]), "0.3.0");
  assert.equal(runCli(legacyCli, consumer, ["--version"]), "0.3.0");

  const project = join(consumer, "project");
  await mkdir(project, { recursive: true });
  run(git, ["init"], { cwd: project });
  run(git, ["config", "user.email", "package-smoke@example.invalid"], {
    cwd: project,
  });
  run(git, ["config", "user.name", "PatchOath Package Smoke"], {
    cwd: project,
  });
  await writeFile(join(project, "app.js"), "export const value = 1;\n", "utf8");
  run(git, ["add", "app.js"], { cwd: project });
  run(git, ["commit", "-m", "initial"], { cwd: project });

  runCli(cli, project, ["init"]);
  await readFile(join(project, ".patchoath", "config.json"), "utf8");
  runCli(cli, project, [
    "checkpoint",
    "--prompt",
    "Package smoke change",
    "--max-files",
    "1",
    "--max-modules",
    "1",
  ]);
  await writeFile(join(project, "app.js"), "export const value = 2;\n", "utf8");
  runCli(cli, project, ["checkpoint", "--finish"]);

  const verification = JSON.parse(runCli(cli, project, ["verify", "--json"]));
  assert.equal(
    verification.valid,
    true,
    "packed CLI should verify its checkpoint",
  );
  assert.match(verification.checkpointId, /^po_/u);
  assert.match(verification.receipt.actualReceiptId, /^poe_[a-f0-9]{24}$/u);
  assert.ok(
    verification.gitEvidence.every((item) =>
      item.ref.startsWith("refs/patchoath/checkpoints/"),
    ),
    "new checkpoints should resolve through the PatchOath Git ref namespace",
  );

  const contractDelta = JSON.parse(
    runCli(cli, project, ["contract-delta", "--json"]),
  );
  assert.equal(contractDelta.status, "already-compliant");
  assert.equal(contractDelta.sourceReceiptVerified, true);
  assert.equal(contractDelta.gitEffectRecomputed, true);
  assert.match(contractDelta.proposalReceipt.receiptId, /^pocd_[a-f0-9]{24}$/u);

  const review = JSON.parse(
    runCli(cli, project, [
      "review",
      "--accept-effect",
      "--reviewer",
      "Package smoke reviewer",
      "--json",
    ]),
  );
  assert.equal(review.created, true);
  assert.match(review.record.recordId, /^por_[a-f0-9]{24}$/u);
  assert.equal(review.authorityBoundary.futureAuthorityGranted, false);
  assert.equal(review.reviewerIdentityVerified, false);
  const reviewVerification = JSON.parse(
    runCli(cli, project, [
      "review",
      "--verify",
      review.record.recordId,
      "--json",
    ]),
  );
  assert.equal(
    reviewVerification.valid,
    true,
    "packed CLI should verify its historical effect review",
  );
  assert.equal(
    reviewVerification.authorityBoundary.changeContractMutated,
    false,
  );

  const capsuleResult = JSON.parse(runCli(cli, project, ["capsule", "--json"]));
  assert.match(capsuleResult.disclosureReceiptId, /^pod_[a-f0-9]{24}$/u);
  const capsuleBytes = await readFile(capsuleResult.path, "utf8");
  assert.equal(
    capsuleBytes.includes("Package smoke change"),
    false,
    "minimum-disclosure capsule should omit prompt text by default",
  );
  const capsuleVerification = JSON.parse(
    runCli(cli, project, ["capsule", "--verify", capsuleResult.path, "--json"]),
  );
  assert.equal(
    capsuleVerification.valid,
    true,
    "packed CLI should verify its Disclosure Receipt",
  );

  const preview = runCli(cli, project, ["restore", "--json"]);
  assert.equal(JSON.parse(preview).canApply, true);
  runCli(cli, project, ["restore", "--apply"]);
  assert.equal(
    normalizeTextForGitComparison(
      await readFile(join(project, "app.js"), "utf8"),
    ),
    "export const value = 1;\n",
    "packed CLI should restore the Git-equivalent checkpoint state without dev dependencies",
  );

  console.log(
    `Package smoke passed: ${packed.filename} (${packed.size} bytes, ${paths.length} files)`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
