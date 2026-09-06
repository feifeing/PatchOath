import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { createRepository, git } from "../test-support/helpers.mjs";

const cli = resolve("bin/patchoath.mjs");

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

async function makeCheckpoint(root) {
  run(root, ["init"]);
  run(root, ["checkpoint", "--prompt", "Change the app value"]);
  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  await writeFile(
    join(root, "generated.js"),
    "export const generated = true;\n",
    "utf8",
  );
  run(root, ["checkpoint", "--finish"]);
}

test("PatchOath restore is dry-run by default and apply restores the before worktree", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await makeCheckpoint(root);

  const headBefore = git(root, ["rev-parse", "HEAD"]);
  const indexBefore = git(root, ["write-tree"]);

  const preview = run(root, ["restore"]);
  assert.match(preview, /PatchOath guarded restore/u);
  assert.match(preview, /dry-run only/u);
  assert.equal(
    await readFile(join(root, "app.js"), "utf8"),
    "export const value = 2;\n",
  );
  await access(join(root, "generated.js"));

  const applied = run(root, ["restore", "--apply"]);
  assert.match(applied, /HEAD and index unchanged/u);
  assert.equal(
    await readFile(join(root, "app.js"), "utf8"),
    "export const value = 1;\n",
  );
  await assert.rejects(access(join(root, "generated.js")), { code: "ENOENT" });
  assert.equal(git(root, ["rev-parse", "HEAD"]), headBefore);
  assert.equal(git(root, ["write-tree"]), indexBefore);
});

test("PatchOath restore blocks when worktree drift appears after checkpoint completion", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await makeCheckpoint(root);

  await writeFile(join(root, "app.js"), "export const value = 3;\n", "utf8");
  const result = runResult(root, ["restore", "--apply"]);

  assert.equal(result.status, 2);
  assert.match(result.stdout, /BLOCKED BY DRIFT/u);
  assert.equal(
    await readFile(join(root, "app.js"), "utf8"),
    "export const value = 3;\n",
  );
});
