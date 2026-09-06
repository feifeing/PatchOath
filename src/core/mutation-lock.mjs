import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { runGit } from "../git/git.mjs";

const LOCK_SCHEMA_VERSION = 1;
const LOCK_DIRECTORY_NAME = "patchoath";
const LOCK_FILE_NAME = "mutation.lock";

function gitCommonDirectory(root) {
  const discovered = runGit(root, ["rev-parse", "--git-common-dir"]).trim();
  return isAbsolute(discovered) ? discovered : resolve(root, discovered);
}

export function mutationLockPath(root) {
  return join(gitCommonDirectory(root), LOCK_DIRECTORY_NAME, LOCK_FILE_NAME);
}

async function readLockOwner(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function lockConflictMessage(path, owner) {
  const details = [];
  if (owner?.pid) details.push(`pid ${owner.pid}`);
  if (owner?.operation) details.push(`operation "${owner.operation}"`);
  if (owner?.startedAt) details.push(`since ${owner.startedAt}`);
  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return [
    `Another PatchOath process is modifying repository evidence${suffix}.`,
    `Mutation lock: ${path}`,
    "Wait for that process to finish. If it is no longer running, inspect the lock and remove it manually before retrying.",
  ].join(" ");
}

export async function acquireMutationLock(root, operation) {
  const path = mutationLockPath(root);
  await mkdir(dirname(path), { recursive: true });

  const owner = {
    schemaVersion: LOCK_SCHEMA_VERSION,
    token: randomUUID(),
    pid: process.pid,
    operation: String(operation || "repository mutation"),
    startedAt: new Date().toISOString(),
  };

  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(lockConflictMessage(path, await readLockOwner(path)));
  }

  try {
    await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(path, { force: true }).catch(() => {});
    throw error;
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
