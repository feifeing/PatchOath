import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { listCheckpoints, loadStore } from "../src/core/store.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

const cli = resolve("bin/patchoath.mjs");

function invoke(root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error) throw result.error;
  return {
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function startCheckpoint(root, prompt = "Change the app value") {
  assert.equal(invoke(root, ["init"]).code, 0);
  const started = invoke(root, ["checkpoint", "--prompt", prompt]);
  assert.equal(started.code, 0);
  const { state } = await loadStore(root);
  assert.ok(state.activeCheckpointId);
  return state.activeCheckpointId;
}

test("checkpoint finish blocks HEAD drift and remains recoverable at the original anchor", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const originalHead = git(root, ["rev-parse", "HEAD"]);
  const checkpointId = await startCheckpoint(root);

  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  git(root, ["add", "app.js"]);
  git(root, ["commit", "-m", "commit while checkpoint is recording"]);

  const blocked = invoke(root, ["checkpoint", "--finish"]);
  assert.equal(blocked.code, 1);
  assert.match(
    blocked.stderr,
    /Repository HEAD changed since the checkpoint started/iu,
  );
  assert.match(blocked.stdout, /Return to the original repository anchor/iu);

  const { state } = await loadStore(root);
  assert.equal(state.activeCheckpointId, checkpointId);
  const recording = (await listCheckpoints(root)).find(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  assert.equal(recording.status, "recording");
  assert.equal(recording.after, undefined);

  git(root, ["reset", "--mixed", originalHead]);
  const finished = invoke(root, ["checkpoint", "--finish"]);
  assert.equal(finished.code, 0);

  const completed = (await listCheckpoints(root)).find(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.analysis.summary.filesChanged, 1);
});

test("live diff blocks a branch switch even when HEAD still points to the same commit", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const checkpointId = await startCheckpoint(
    root,
    "Edit app.js without changing branches",
  );
  const originalHead = git(root, ["rev-parse", "HEAD"]);

  git(root, ["switch", "-c", "alternate"]);
  assert.equal(git(root, ["rev-parse", "HEAD"]), originalHead);
  await writeFile(join(root, "app.js"), "export const value = 3;\n", "utf8");

  const blocked = invoke(root, ["diff", "--json"]);
  assert.equal(blocked.code, 1);
  assert.equal(blocked.stdout, "");
  assert.match(
    blocked.stderr,
    /Repository branch changed since the checkpoint started/iu,
  );

  git(root, ["switch", "main"]);
  const finished = invoke(root, ["checkpoint", "--finish"]);
  assert.equal(finished.code, 0);
  const completed = (await listCheckpoints(root)).find(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  assert.equal(completed.status, "completed");
});

test("abort remains available after repository-anchor drift", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const checkpointId = await startCheckpoint(root);

  git(root, ["switch", "-c", "other-branch"]);
  const aborted = invoke(root, ["checkpoint", "--abort"]);
  assert.equal(aborted.code, 0);

  const { state } = await loadStore(root);
  assert.equal(state.activeCheckpointId, null);
  assert.equal(
    (await listCheckpoints(root)).some(
      (checkpoint) => checkpoint.id === checkpointId,
    ),
    false,
  );
});
