import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  LEGACY_STORE_DIRECTORY_NAME,
  STORE_DIRECTORY_NAME,
} from "../src/core/brand.mjs";
import {
  collectIgnoredWorktreeState,
  ignoredEvidenceCoverage,
  parseIgnoredStatus,
} from "../src/git/ignored.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

const cli = resolve("bin/patchoath.mjs");

function run(root, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

async function repositoryWithIgnoredDist(context) {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, ".gitignore"), "dist/\n", "utf8");
  git(root, ["add", ".gitignore"]);
  git(root, ["commit", "-m", "ignore dist"]);
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "bundle.js"), "generated-v1\n", "utf8");
  return root;
}

test("ignored status parsing excludes PatchOath internal stores without storing path names", () => {
  const output = [
    `!! ${STORE_DIRECTORY_NAME}/`,
    `!! ${LEGACY_STORE_DIRECTORY_NAME}/`,
    "!! dist/",
    "!! .env.local",
    "",
  ].join("\0");

  assert.deepEqual(parseIgnoredStatus(output), [".env.local", "dist"]);
});

test("ignored worktree coverage is aggregate-only and excludes PatchOath's local store", async (context) => {
  const root = await repositoryWithIgnoredDist(context);
  run(root, ["init"]);

  const state = collectIgnoredWorktreeState(root);
  assert.equal(state.roots, 1);
  assert.match(state.rootSetSha256, /^[a-f0-9]{64}$/u);
  assert.equal(state.pathNamesStored, false);
  assert.equal(state.contentCaptured, false);

  const coverage = ignoredEvidenceCoverage(root);
  assert.equal(coverage.ignoredWorktree.policy, "excluded");
  assert.equal(coverage.ignoredWorktree.rootsDetected, 1);
  assert.equal(coverage.ignoredWorktree.receiptBound, false);
  assert.equal(coverage.gitSnapshot.ignoredContentCaptured, false);
});

test("completed checkpoints persist an explicit ignored-content coverage boundary", async (context) => {
  const root = await repositoryWithIgnoredDist(context);
  run(root, ["init"]);
  run(root, ["checkpoint", "--prompt", "Change the app value"]);
  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  run(root, ["checkpoint", "--finish"]);

  const names = await readdir(join(root, STORE_DIRECTORY_NAME, "checkpoints"));
  assert.equal(names.length, 1);
  const checkpoint = JSON.parse(
    await readFile(
      join(root, STORE_DIRECTORY_NAME, "checkpoints", names[0]),
      "utf8",
    ),
  );

  assert.equal(
    checkpoint.analysis.evidenceCoverage.ignoredWorktree.rootsDetected,
    1,
  );
  assert.equal(
    checkpoint.analysis.evidenceCoverage.ignoredWorktree.contentCaptured,
    false,
  );
  assert.equal(
    checkpoint.analysis.evidenceCoverage.ignoredWorktree.pathNamesStored,
    false,
  );

  const verified = JSON.parse(run(root, ["verify", checkpoint.id, "--json"]));
  assert.equal(verified.valid, true);
  assert.equal(verified.receipt.coverage.ignoredPathEvidenceBound, false);
  assert.equal(verified.receipt.coverage.ignoredContentCaptured, false);
});

test("ignored-only edits are not silently presented as fully observed work", async (context) => {
  const root = await repositoryWithIgnoredDist(context);
  run(root, ["init"]);
  run(root, ["checkpoint", "--prompt", "Regenerate the ignored bundle"]);
  await writeFile(join(root, "dist", "bundle.js"), "generated-v2\n", "utf8");

  const result = spawnSync(process.execPath, [cli, "checkpoint", "--finish"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No code changes were detected/u);
  assert.match(
    result.stderr,
    /warning evidence coverage excludes 1 Git-ignored path root/u,
  );
  assert.match(result.stderr, /Presence alone does not mean they changed/u);
});
