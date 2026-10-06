import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectCommitDiff, collectPatch } from "../src/git/diff.mjs";
import { createWorktreeSnapshot } from "../src/git/snapshot.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

test("attest exits with authorization drift for a real protected-source rename", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src/auth"), { recursive: true });
  await mkdir(join(root, "src/ui"), { recursive: true });
  await writeFile(join(root, "src/auth/token.js"), "export const token = 1;\n");
  git(root, ["add", "src/auth/token.js"]);
  git(root, ["commit", "-m", "add protected source"]);
  git(root, ["mv", "src/auth/token.js", "src/ui/helper.js"]);
  const result = spawnSync(
    process.execPath,
    [
      resolve("bin/patchoath.mjs"),
      "attest",
      "--prompt",
      "Move a helper",
      "--allow",
      "src/ui/**",
      "--deny",
      "src/auth/**",
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 2, result.stderr);
  const checkpoint = JSON.parse(result.stdout);
  assert.equal(checkpoint.analysis.files[0].status, "renamed");
  assert.deepEqual(checkpoint.analysis.contractCompliance.protectedFiles, [
    "src/auth/token.js",
  ]);
  assert.equal(checkpoint.analysis.summary.modulesChanged, 2);
});

async function submoduleFixture(context) {
  const root = await createRepository();
  const source = await createRepository();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });
  git(root, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    source,
    "modules/nested",
  ]);
  git(root, ["commit", "-am", "add submodule"]);
  git(root, ["config", "diff.ignoreSubmodules", "all"]);
  const nested = join(root, "modules/nested");
  git(nested, ["config", "user.name", "Submodule Test"]);
  git(nested, ["config", "user.email", "submodule@example.invalid"]);
  return { root, nested };
}

test("submodule pointer changes remain visible despite Git ignore settings", async (context) => {
  const { root, nested } = await submoduleFixture(context);
  await writeFile(join(nested, "app.js"), "export const value = 2;\n");
  git(nested, ["commit", "-am", "nested change"]);
  const indexBefore = git(root, ["write-tree"]);
  const snapshot = await createWorktreeSnapshot(root);
  assert.deepEqual(
    collectCommitDiff(root, snapshot.head, snapshot.commit).map(
      (file) => file.path,
    ),
    ["modules/nested"],
  );
  assert.match(
    collectPatch(root, snapshot.head, snapshot.commit),
    /Subproject commit/u,
  );
  assert.equal(git(root, ["write-tree"]), indexBefore);
});

for (const kind of ["tracked", "untracked"]) {
  test(`uncaptured ${kind} submodule content blocks snapshots without changing the real index`, async (context) => {
    const { root, nested } = await submoduleFixture(context);
    const path = join(nested, kind === "tracked" ? "app.js" : "new.txt");
    await writeFile(path, "uncommitted submodule data\n");
    const indexBefore = await readFile(join(root, ".git", "index"));
    await assert.rejects(
      createWorktreeSnapshot(root),
      /uncommitted submodule/iu,
    );
    assert.deepEqual(await readFile(join(root, ".git", "index")), indexBefore);
    assert.equal(await readFile(path, "utf8"), "uncommitted submodule data\n");
  });
}

for (const flag of ["assume-unchanged", "skip-worktree"]) {
  test(`temporary snapshots capture edits hidden by the real index's ${flag} flag`, async (context) => {
    const root = await createRepository();
    context.after(() => rm(root, { recursive: true, force: true }));
    git(root, ["update-index", `--${flag}`, "app.js"]);
    const indexBefore = await readFile(join(root, ".git", "index"));
    await writeFile(join(root, "app.js"), "export const value = 2;\n");
    const snapshot = await createWorktreeSnapshot(root);
    assert.equal(
      collectCommitDiff(root, snapshot.head, snapshot.commit)[0].path,
      "app.js",
    );
    assert.deepEqual(await readFile(join(root, ".git", "index")), indexBefore);
  });
}

test("evidence diffs bypass text conversion and color configuration", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const converter = join(root, ".git", "hide-diff.cjs");
  await writeFile(converter, 'process.stdout.write("MASKED\\n");\n');
  const quoted = (path) => `"${path.replaceAll("\\", "/")}"`;
  git(root, [
    "config",
    "diff.hidden.textconv",
    `${quoted(process.execPath)} ${quoted(converter)}`,
  ]);
  git(root, ["config", "color.ui", "always"]);
  await writeFile(join(root, ".gitattributes"), "app.js diff=hidden\n");
  await writeFile(join(root, "app.js"), "export const value = 2;\n");
  const snapshot = await createWorktreeSnapshot(root);
  const patch = collectPatch(root, snapshot.head, snapshot.commit);
  assert.match(patch, /\+export const value = 2;/u);
  assert.doesNotMatch(patch, /MASKED|\u001b\[/u);
});
