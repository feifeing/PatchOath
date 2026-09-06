import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import { createRepository } from "../test-support/helpers.mjs";
import {
  acquireMutationLock,
  classifyMutationOperation,
  mutationLockPath,
  withMutationLock,
} from "../src/core/mutation-lock.mjs";

const cli = fileURLToPath(new URL("../bin/patchoath.mjs", import.meta.url));

function runCli(root, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("mutation classification locks writes but leaves read-only commands concurrent", () => {
  const mutations = [
    [["init"], "init"],
    [["checkpoint", "--prompt", "x"], "checkpoint"],
    [["checkpoint", "--finish"], "checkpoint"],
    [["session", "new"], "session new"],
    [["report"], "report"],
    [["restore", "--apply"], "restore --apply"],
    [["capsule"], "capsule"],
    [["review", "--accept-effect"], "review"],
  ];
  for (const [argv, expected] of mutations) {
    assert.equal(classifyMutationOperation(argv), expected, argv.join(" "));
  }

  for (const argv of [
    [],
    ["--help"],
    ["checkpoint", "--help"],
    ["attest", "--prompt", "x"],
    ["diff"],
    ["replay"],
    ["session"],
    ["verify"],
    ["contract-delta"],
    ["restore"],
    ["capsule", "--verify", "capsule.json"],
    ["review", "--verify", "por_example"],
    ["review", "--list"],
  ]) {
    assert.equal(classifyMutationOperation(argv), null, argv.join(" "));
  }
});

test("a held repository mutation lock rejects a second writer and exposes owner metadata", async () => {
  const root = await createRepository();
  try {
    const lock = await acquireMutationLock(root, "test writer");
    const stored = JSON.parse(await readFile(lock.path, "utf8"));
    assert.equal(stored.operation, "test writer");
    assert.equal(stored.pid, process.pid);
    assert.equal(typeof stored.token, "string");

    await assert.rejects(
      acquireMutationLock(root, "second writer"),
      /Another PatchOath process is modifying repository evidence/u,
    );

    await lock.release();
    const next = await acquireMutationLock(root, "next writer");
    await next.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("withMutationLock releases ownership even when the mutation throws", async () => {
  const root = await createRepository();
  try {
    await assert.rejects(
      withMutationLock(root, "failing writer", async () => {
        throw new Error("expected mutation failure");
      }),
      /expected mutation failure/u,
    );
    const lock = await acquireMutationLock(root, "recovery writer");
    await lock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the real PatchOath CLI refuses a concurrent checkpoint mutation", async () => {
  const root = await createRepository();
  try {
    const lock = await acquireMutationLock(root, "held by test");
    const blocked = runCli(root, ["checkpoint", "--prompt", "Concurrent edit"]);
    assert.equal(blocked.status, 1);
    assert.match(
      blocked.stderr,
      /Another PatchOath process is modifying repository evidence/u,
    );
    assert.match(blocked.stderr, /held by test/u);

    await lock.release();
    const allowed = runCli(root, ["checkpoint", "--prompt", "Concurrent edit"]);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /Checkpoint recording/u);

    const state = JSON.parse(
      await readFile(resolve(root, ".patchoath", "state.json"), "utf8"),
    );
    assert.match(state.activeCheckpointId, /^po_/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mutation locks live under Git metadata rather than the evidence store", async () => {
  const root = await createRepository();
  try {
    const path = mutationLockPath(root).replaceAll("\\", "/");
    assert.match(path, /\.git\/patchoath\/mutation\.lock$/u);
    assert.doesNotMatch(path, /\.patchoath\/mutation\.lock$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
