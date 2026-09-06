import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { createRepository } from "../test-support/helpers.mjs";

const cli = resolve("bin/patchoath.mjs");
const store = ".patchoath";

function run(root, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function runResult(root, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

async function checkpointPath(root) {
  const names = await readdir(join(root, store, "checkpoints"));
  assert.equal(names.length, 1);
  return join(root, store, "checkpoints", names[0]);
}

async function createViolatedCheckpoint(root) {
  run(root, ["init"]);
  run(root, [
    "checkpoint",
    "--prompt",
    "Change the app value only",
    "--allow",
    "app.js",
    "--max-files",
    "1",
    "--max-lines",
    "4",
    "--max-modules",
    "1",
  ]);
  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  await writeFile(
    join(root, "extra.js"),
    "export const extra = true;\n",
    "utf8",
  );
  run(root, ["checkpoint", "--finish"]);
}

test("historical acceptance is stored separately and cannot mutate future authority", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createViolatedCheckpoint(root);

  const path = await checkpointPath(root);
  const checkpointBefore = await readFile(path, "utf8");
  const deltaBefore = JSON.parse(run(root, ["contract-delta", "--json"]));
  assert.equal(deltaBefore.status, "proposal-ready");
  assert.match(deltaBefore.proposalReceipt.receiptId, /^pocd_/u);

  const result = JSON.parse(
    run(root, [
      "review",
      "--accept-effect",
      "--note",
      "Accepted for this historical checkpoint only",
      "--reviewer",
      "Maintainer A",
      "--json",
    ]),
  );

  assert.equal(result.created, true);
  assert.equal(result.record.disposition, "accept-effect");
  assert.match(result.record.recordId, /^por_[a-f0-9]{24}$/u);
  assert.equal(result.authorityBoundary.historicalEffectOnly, true);
  assert.equal(result.authorityBoundary.changeContractMutated, false);
  assert.equal(result.authorityBoundary.futureAuthorityGranted, false);
  assert.equal(result.reviewerIdentityVerified, false);

  const checkpointAfter = await readFile(path, "utf8");
  assert.equal(
    checkpointAfter,
    checkpointBefore,
    "recording a historical review must not rewrite the checkpoint, receipt, or Change Contract",
  );

  const deltaAfter = JSON.parse(run(root, ["contract-delta", "--json"]));
  assert.deepEqual(
    deltaAfter,
    deltaBefore,
    "historical acceptance must not change the contract-delta recommendation or authority state",
  );

  const verification = JSON.parse(
    run(root, ["review", "--verify", result.record.recordId, "--json"]),
  );
  assert.equal(verification.valid, true);
  assert.equal(verification.recordIntegrity.valid, true);
  assert.equal(verification.sourceEvidence.valid, true);
  assert.equal(verification.authorityBoundary.futureAuthorityGranted, false);
});

test("tampered PatchOath review records fail verification", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createViolatedCheckpoint(root);

  const created = JSON.parse(
    run(root, ["review", "--reject-effect", "--json"]),
  );
  const reviewPath = join(
    root,
    store,
    "reviews",
    `${created.record.recordId}.json`,
  );
  const tampered = JSON.parse(await readFile(reviewPath, "utf8"));
  tampered.note = "tampered after recording";
  await writeFile(reviewPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");

  const verification = runResult(root, [
    "review",
    "--verify",
    created.record.recordId,
    "--json",
  ]);
  assert.equal(verification.status, 2);
  const result = JSON.parse(verification.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "review-record-mismatch");
});

test("new reviews are refused when source checkpoint evidence no longer verifies", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await createViolatedCheckpoint(root);

  const path = await checkpointPath(root);
  const checkpoint = JSON.parse(await readFile(path, "utf8"));
  checkpoint.prompt.text = "tampered prompt";
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");

  const attempt = runResult(root, ["review", "--needs-follow-up", "--json"]);
  assert.equal(attempt.status, 2);
  const result = JSON.parse(attempt.stdout);
  assert.equal(result.created, false);
  assert.equal(result.reason, "source-evidence-not-verified");
});
