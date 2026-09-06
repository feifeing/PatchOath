import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parseArguments } from "../src/cli.mjs";
import { listCheckpoints } from "../src/core/store.mjs";
import { createRepository } from "../test-support/helpers.mjs";

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

test("PatchOath help works outside a repository", () => {
  const result = invoke("/", ["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /PatchOath 0\.3\.0/iu);
  assert.match(result.stdout, /Make every AI patch prove it stayed in scope/iu);
  assert.match(result.stdout, /Intent is context, not permission/iu);
  assert.doesNotMatch(result.stdout, /Time travel for vibe coding/iu);
});

test("PatchOath version works outside a repository without printing help", () => {
  const result = invoke("/", ["--version"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "0.3.0");
  assert.equal(result.stderr, "");
});

test("CLI argument parsing supports inline values and rejects malformed options", () => {
  assert.deepEqual(
    parseArguments([
      "checkpoint",
      "--prompt=Make the hero cinematic",
      "--from-head",
    ]),
    {
      command: "checkpoint",
      options: {
        "--prompt": "Make the hero cinematic",
        "--from-head": true,
      },
      positionals: [],
    },
  );
  assert.throws(
    () => parseArguments(["checkpoint", "--prompt"]),
    /requires a value/iu,
  );
  assert.throws(
    () => parseArguments(["diff", "--mystery"]),
    /Unknown option/iu,
  );
});

test("two-phase PatchOath CLI creates a readable checkpoint and rejects an empty finish", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const initialized = invoke(root, ["init"]);
  assert.equal(initialized.code, 0);
  assert.match(initialized.stdout, /\.patchoath\//u);

  const started = invoke(root, [
    "checkpoint",
    "--prompt",
    "Change the button color",
  ]);
  assert.equal(started.code, 0);
  assert.match(started.stdout, /Checkpoint recording/iu);
  assert.match(started.stdout, /patchoath checkpoint --finish/iu);

  const emptyFinish = invoke(root, ["checkpoint", "--finish"]);
  assert.equal(emptyFinish.code, 1);
  assert.match(emptyFinish.stderr, /No code changes/iu);

  await writeFile(join(root, "app.js"), "export const value = 2;\n", "utf8");
  await writeFile(
    join(root, "src-router.js"),
    'export const route = "/";\n',
    "utf8",
  );

  const preview = invoke(root, ["diff", "--json"]);
  assert.equal(preview.code, 0);
  const previewJson = JSON.parse(preview.stdout);
  assert.equal(previewJson.analysis.summary.filesChanged, 2);

  const finished = invoke(root, ["checkpoint", "--finish"]);
  assert.equal(finished.code, 0);
  assert.match(finished.stdout, /PatchOath/iu);

  const checkpoints = await listCheckpoints(root);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].status, "completed");
  assert.match(checkpoints[0].id, /^po_/u);
  assert.equal(checkpoints[0].analysis.files.length, 2);
  assert.equal(typeof checkpoints[0].analysis.risk.model, "string");

  const raw = JSON.parse(
    await readFile(
      join(root, ".patchoath", "checkpoints", `${checkpoints[0].id}.json`),
      "utf8",
    ),
  );
  assert.equal(raw.schemaVersion, 2);
  assert.match(raw.receipt.receiptId, /^poe_/u);
  assert.match(raw.before.ref, /^refs\/patchoath\//u);
  assert.match(raw.after.ref, /^refs\/patchoath\//u);

  assert.equal(
    invoke(root, ["session", "new", "--name", "Second pass"]).code,
    0,
  );
  const emptyReplay = invoke(root, ["replay"]);
  assert.equal(emptyReplay.code, 1);
  assert.match(emptyReplay.stderr, /No checkpoints exist/iu);

  const emptyReport = invoke(root, ["report"]);
  assert.equal(emptyReport.code, 1);
  assert.match(emptyReport.stderr, /No completed checkpoint/iu);

  const explicitOldReport = invoke(root, ["report", checkpoints[0].id]);
  assert.equal(explicitOldReport.code, 0);
  assert.match(explicitOldReport.stdout, /index\.html/iu);
});

test("from-head refuses to create a meaningless clean checkpoint", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const result = invoke(root, [
    "checkpoint",
    "--prompt",
    "No-op",
    "--from-head",
  ]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /No changes were detected/iu);
  assert.equal((await listCheckpoints(root)).length, 0);
});

test("sessions create separate replay timelines and block rollover while recording", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));

  const created = invoke(root, [
    "session",
    "new",
    "--name",
    "Landing page pass",
    "--json",
  ]);
  assert.equal(created.code, 0);
  const session = JSON.parse(created.stdout);
  assert.equal(session.name, "Landing page pass");

  const current = invoke(root, ["session", "--json"]);
  assert.equal(current.code, 0);
  assert.equal(JSON.parse(current.stdout).id, session.id);

  assert.equal(
    invoke(root, ["checkpoint", "--prompt", "Make the hero cinematic"]).code,
    0,
  );
  const blocked = invoke(root, ["session", "new"]);
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /Finish or abort active checkpoint/iu);

  assert.equal(invoke(root, ["checkpoint", "--abort"]).code, 0);
  const afterAbort = invoke(root, ["session", "--json"]);
  assert.equal(JSON.parse(afterAbort.stdout).checkpoints.length, 0);
});

test("checkpoint gives a clear error in a repository without a first commit", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-empty-repo-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const initialized = spawnSync("git", ["init", "-q"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0);

  const result = invoke(root, ["checkpoint", "--prompt", "Start here"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /at least one Git commit/iu);
  assert.match(result.stdout, /Create an initial commit/iu);
});
