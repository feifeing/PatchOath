import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

async function exitedChildPid(context) {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
    stdio: "ignore",
  });
  const pid = child.pid;
  await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  try {
    process.kill(pid, 0);
    context.skip(`Child pid ${pid} was reused before stale-lock verification.`);
    return null;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return pid;
  }
}

async function writeRawLock(root, owner) {
  const path = mutationLockPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
  return path;
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
    assert.equal(stored.hostname, hostname());
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

test("a proven same-host stale mutation lock is reclaimed automatically", async (context) => {
  const root = await createRepository();
  try {
    const pid = await exitedChildPid(context);
    if (!pid) return;
    const path = await writeRawLock(root, {
      schemaVersion: 1,
      token: "stale-owner-token",
      pid,
      hostname: hostname(),
      operation: "crashed writer",
      startedAt: "2026-09-08T00:00:00.000Z",
    });

    const recovered = await acquireMutationLock(root, "recovery writer");
    assert.equal(recovered.path, path);
    assert.notEqual(recovered.owner.token, "stale-owner-token");
    assert.equal(recovered.owner.pid, process.pid);
    await recovered.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy and foreign-host stale-looking locks remain fail closed", async (context) => {
  const root = await createRepository();
  try {
    const pid = await exitedChildPid(context);
    if (!pid) return;
    const path = await writeRawLock(root, {
      schemaVersion: 1,
      token: "legacy-stale-token",
      pid,
      operation: "legacy crashed writer",
      startedAt: "2026-09-08T00:00:00.000Z",
    });

    await assert.rejects(
      acquireMutationLock(root, "should stay blocked"),
      /Another PatchOath process is modifying repository evidence/u,
    );
    assert.equal(
      JSON.parse(await readFile(path, "utf8")).token,
      "legacy-stale-token",
    );

    await rm(path);
    await writeRawLock(root, {
      schemaVersion: 1,
      token: "foreign-stale-token",
      pid,
      hostname: `${hostname()}-different-host`,
      operation: "foreign writer",
      startedAt: "2026-09-08T00:00:00.000Z",
    });
    await assert.rejects(
      acquireMutationLock(root, "should stay blocked"),
      /Another PatchOath process is modifying repository evidence/u,
    );
    assert.equal(
      JSON.parse(await readFile(path, "utf8")).token,
      "foreign-stale-token",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lock release never removes a replacement owned by another token", async () => {
  const root = await createRepository();
  try {
    const lock = await acquireMutationLock(root, "original writer");
    const replacement = {
      schemaVersion: 1,
      token: "replacement-owner-token",
      pid: process.pid,
      hostname: hostname(),
      operation: "replacement writer",
      startedAt: new Date().toISOString(),
    };
    await writeFile(
      lock.path,
      `${JSON.stringify(replacement, null, 2)}\n`,
      "utf8",
    );

    await lock.release();
    assert.equal(
      JSON.parse(await readFile(lock.path, "utf8")).token,
      replacement.token,
    );
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
