import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { runGit } from "../git/git.mjs";

const LOCK_SCHEMA_VERSION = 1;
const LOCK_DIRECTORY_NAME = "patchoath";
const LOCK_FILE_NAME = "mutation.lock";
const RECLAIM_FILE_NAME = "mutation.lock.reclaim";

function gitCommonDirectory(root) {
  const discovered = runGit(root, ["rev-parse", "--git-common-dir"]).trim();
  return isAbsolute(discovered) ? discovered : resolve(root, discovered);
}

function isHelpOrVersion(argv) {
  return argv.some((token) =>
    ["--help", "-h", "--version", "-v"].includes(token),
  );
}

export function classifyMutationOperation(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || isHelpOrVersion(argv)) {
    return null;
  }
  const command = argv[0];
  if (command === "init") return "init";
  if (command === "checkpoint") return "checkpoint";
  if (command === "report") return "report";
  if (command === "session" && argv[1] === "new") return "session new";
  if (command === "restore" && argv.includes("--apply"))
    return "restore --apply";
  if (command === "capsule" && !argv.includes("--verify")) return "capsule";
  if (
    command === "review" &&
    !argv.includes("--verify") &&
    !argv.includes("--list")
  ) {
    return "review";
  }
  return null;
}

export function mutationLockPath(root) {
  return join(gitCommonDirectory(root), LOCK_DIRECTORY_NAME, LOCK_FILE_NAME);
}

function reclaimLockPath(path) {
  return join(dirname(path), RECLAIM_FILE_NAME);
}

async function readLockOwner(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return "unknown";
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (error.code === "ESRCH") return "dead";
    return "unknown";
  }
}

function reclaimableOwner(owner) {
  return (
    owner?.schemaVersion === LOCK_SCHEMA_VERSION &&
    typeof owner.token === "string" &&
    owner.token.length > 0 &&
    typeof owner.hostname === "string" &&
    owner.hostname === hostname() &&
    processState(owner.pid) === "dead"
  );
}

function sameLockOwner(left, right) {
  return (
    left?.schemaVersion === right?.schemaVersion &&
    left?.token === right?.token &&
    left?.pid === right?.pid &&
    left?.hostname === right?.hostname
  );
}

async function reclaimProvenStaleLock(path) {
  const guardPath = reclaimLockPath(path);
  let guard;
  try {
    guard = await open(guardPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }

  try {
    const observed = await readLockOwner(path);
    if (!reclaimableOwner(observed)) return false;

    const confirmed = await readLockOwner(path);
    if (!sameLockOwner(observed, confirmed) || !reclaimableOwner(confirmed)) {
      return false;
    }

    await rm(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  } finally {
    await guard.close().catch(() => {});
    await rm(guardPath, { force: true }).catch(() => {});
  }
}

function lockConflictMessage(path, owner) {
  const details = [];
  if (owner?.pid) details.push(`pid ${owner.pid}`);
  if (owner?.hostname) details.push(`host ${owner.hostname}`);
  if (owner?.operation) details.push(`operation "${owner.operation}"`);
  if (owner?.startedAt) details.push(`since ${owner.startedAt}`);
  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return [
    `Another PatchOath process is modifying repository evidence${suffix}.`,
    `Mutation lock: ${path}`,
    "PatchOath only reclaims a lock automatically when it can prove the same-host owner process has exited. Otherwise inspect the lock before removing it manually.",
  ].join(" ");
}

async function createOwnedLock(path, owner) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return null;
    throw error;
  }

  try {
    await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`, "utf8");
    await handle.sync();
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    const current = await readLockOwner(path);
    if (current?.token === owner.token) {
      await rm(path, { force: true }).catch(() => {});
    }
    throw error;
  }
}

export async function acquireMutationLock(root, operation) {
  const path = mutationLockPath(root);
  await mkdir(dirname(path), { recursive: true });

  const owner = {
    schemaVersion: LOCK_SCHEMA_VERSION,
    token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    operation: String(operation || "repository mutation"),
    startedAt: new Date().toISOString(),
  };

  let handle = await createOwnedLock(path, owner);
  if (!handle) {
    const reclaimed = await reclaimProvenStaleLock(path);
    if (reclaimed) handle = await createOwnedLock(path, owner);
  }
  if (!handle) {
    throw new Error(lockConflictMessage(path, await readLockOwner(path)));
  }

  let released = false;
  return {
    path,
    owner,
    async release() {
      if (released) return;
      released = true;
      await handle.close().catch(() => {});
      const current = await readLockOwner(path);
      if (current?.token === owner.token) {
        await rm(path, { force: true });
      }
    },
  };
}

export async function withMutationLock(root, operation, callback) {
  const lock = await acquireMutationLock(root, operation);
  try {
    return await callback();
  } finally {
    await lock.release();
  }
}
