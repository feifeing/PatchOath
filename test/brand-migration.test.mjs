import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { createEvidenceReceipt } from "../src/core/receipt.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

const patchoath = resolve("bin/patchoath.mjs");
const legacyCli = resolve("bin/vibetrace.mjs");

function run(cli, root, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function runResult(cli, root, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function legacyCheckpoint(root) {
  const head = git(root, ["rev-parse", "HEAD"]);
  const id = "vt_legacy_fixture";
  const checkpoint = {
    schemaVersion: 2,
    id,
    sessionId: "legacy-session",
    status: "completed",
    createdAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:01:00.000Z",
    prompt: { text: "Legacy button change", source: "manual-cli" },
    authorization: null,
    repository: { head },
    before: {
      commit: head,
      ref: `refs/vibetrace/checkpoints/${id}/before`,
    },
    after: {
      commit: head,
      ref: `refs/vibetrace/checkpoints/${id}/after`,
    },
    analysis: {
      files: [],
      summary: {
        filesChanged: 0,
        linesChanged: 0,
        modulesChanged: 0,
        additions: 0,
        deletions: 0,
      },
      contractCompliance: {
        declared: false,
        status: "not-declared",
        violations: [],
      },
      blastRadius: { score: 0, level: "contained" },
      risk: { score: 0, level: "low", factors: [] },
    },
    visual: null,
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint, {
    version: 1,
    legacyPrefix: true,
  });
  return checkpoint;
}

test("fresh repositories use only the PatchOath store and modern evidence namespaces", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const initialized = run(patchoath, root, ["init"]);
  assert.match(initialized, /initialized \.patchoath\//u);
  assert.equal(await pathExists(join(root, ".patchoath")), true);
  assert.equal(await pathExists(join(root, ".vibetrace")), false);

  run(patchoath, root, ["checkpoint", "--prompt", "Change the app value"]);
  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  run(patchoath, root, ["checkpoint", "--finish"]);

  const names = await readdir(join(root, ".patchoath", "checkpoints"));
  assert.equal(names.length, 1);
  const checkpoint = JSON.parse(
    await readFile(join(root, ".patchoath", "checkpoints", names[0]), "utf8"),
  );
  assert.match(checkpoint.id, /^po_/u);
  assert.match(checkpoint.receipt.receiptId, /^poe_/u);
  assert.match(checkpoint.before.ref, /^refs\/patchoath\//u);
  assert.match(checkpoint.after.ref, /^refs\/patchoath\//u);
  assert.equal(
    git(root, ["rev-parse", "--verify", checkpoint.before.ref]),
    checkpoint.before.commit,
  );
  assert.equal(
    git(root, ["rev-parse", "--verify", checkpoint.after.ref]),
    checkpoint.after.commit,
  );
});

test("PatchOath verifies legacy receipts/refs without silently moving the legacy store", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const checkpoint = legacyCheckpoint(root);
  const legacyDirectory = join(root, ".vibetrace");
  const checkpointDirectory = join(legacyDirectory, "checkpoints");
  await mkdir(checkpointDirectory, { recursive: true });
  await writeFile(
    join(checkpointDirectory, `${checkpoint.id}.json`),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    "utf8",
  );
  for (const phase of ["before", "after"]) {
    git(root, ["update-ref", checkpoint[phase].ref, checkpoint[phase].commit]);
  }

  assert.match(checkpoint.receipt.receiptId, /^vtr_/u);

  const initialized = run(patchoath, root, ["init"]);
  assert.match(initialized, /\.vibetrace\/ \(legacy compatibility store/u);
  assert.equal(await pathExists(join(root, ".patchoath")), false);
  assert.equal(await pathExists(legacyDirectory), true);

  const verification = JSON.parse(
    run(patchoath, root, ["verify", checkpoint.id, "--json"]),
  );
  assert.equal(verification.valid, true);
  assert.equal(
    verification.receipt.actualReceiptId,
    checkpoint.receipt.receiptId,
  );
  assert.equal(verification.receipt.coverage.scope, "legacy-v1");
  assert.ok(
    verification.gitEvidence.every((item) =>
      item.ref.startsWith("refs/vibetrace/"),
    ),
  );

  const storedAfterVerify = JSON.parse(
    await readFile(join(checkpointDirectory, `${checkpoint.id}.json`), "utf8"),
  );
  assert.equal(
    storedAfterVerify.receipt.receiptId,
    checkpoint.receipt.receiptId,
  );
  assert.equal(storedAfterVerify.before.ref, checkpoint.before.ref);
  assert.equal(storedAfterVerify.after.ref, checkpoint.after.ref);
});

test("new PatchOath checkpoints in a legacy store use modern IDs and refs without relocating old evidence", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, ".vibetrace", "checkpoints"), { recursive: true });
  run(patchoath, root, ["init"]);

  run(patchoath, root, [
    "checkpoint",
    "--prompt",
    "Change the app value after migration",
  ]);
  await writeFile(join(root, "app.js"), "export const value = 3;\n", "utf8");
  run(patchoath, root, ["checkpoint", "--finish"]);

  assert.equal(await pathExists(join(root, ".patchoath")), false);
  const names = await readdir(join(root, ".vibetrace", "checkpoints"));
  const modernName = names.find((name) => name.startsWith("po_"));
  assert.ok(modernName, "a new po_ checkpoint should be written in-place");
  const checkpoint = JSON.parse(
    await readFile(join(root, ".vibetrace", "checkpoints", modernName), "utf8"),
  );
  assert.match(checkpoint.receipt.receiptId, /^poe_/u);
  assert.match(checkpoint.before.ref, /^refs\/patchoath\//u);
  assert.match(checkpoint.after.ref, /^refs\/patchoath\//u);
  assert.equal(
    git(root, ["rev-parse", "--verify", checkpoint.after.ref]),
    checkpoint.after.commit,
  );
});

test("legacy command shim warns and forwards to the PatchOath v0.3 CLI", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = runResult(legacyCli, root, ["--version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "0.3.0");
  assert.match(result.stderr, /legacy command name/iu);
  assert.match(result.stderr, /patchoath/iu);
});
