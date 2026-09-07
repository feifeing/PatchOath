import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  CHECKPOINT_ID_PREFIX,
  LEGACY_CHECKPOINT_ID_PREFIX,
  LEGACY_REF_NAMESPACE,
  LEGACY_STORE_DIRECTORY_NAME,
  REF_NAMESPACE,
  STORE_DIRECTORY_NAME,
} from "./brand.mjs";
import {
  runtimeChangeContract,
  setRuntimeChangeContract,
} from "./contract.mjs";
import { createId } from "./id.mjs";
import { createEvidenceReceipt } from "./receipt.mjs";
import { writeFileAtomic } from "./safe-file.mjs";
import { CONFIG_SCHEMA_VERSION, assertValidCheckpoint } from "./schema.mjs";
import {
  ensureEvidenceStoreLayout,
  ensurePhysicalDirectory,
} from "./store-boundary.mjs";
import {
  assertPrefixedStorageId,
  storageIdFromJsonFilename,
} from "./storage-key.mjs";
import { runGit } from "../git/git.mjs";

const CHECKPOINT_PREFIXES = [CHECKPOINT_ID_PREFIX, LEGACY_CHECKPOINT_ID_PREFIX];
const SESSION_PREFIXES = ["session"];

function assertCheckpointId(id) {
  return assertPrefixedStorageId(id, CHECKPOINT_PREFIXES, "checkpoint ID");
}

function assertSessionId(id) {
  return assertPrefixedStorageId(id, SESSION_PREFIXES, "session ID");
}

function selectedStoreDirectory(root) {
  const preferred = join(root, STORE_DIRECTORY_NAME);
  const legacy = join(root, LEGACY_STORE_DIRECTORY_NAME);
  if (existsSync(preferred)) return preferred;
  if (existsSync(legacy)) return legacy;
  return preferred;
}

export function storePaths(root) {
  const directory = selectedStoreDirectory(root);
  return {
    directory,
    directoryName:
      directory === join(root, LEGACY_STORE_DIRECTORY_NAME)
        ? LEGACY_STORE_DIRECTORY_NAME
        : STORE_DIRECTORY_NAME,
    legacy: directory === join(root, LEGACY_STORE_DIRECTORY_NAME),
    config: join(directory, "config.json"),
    state: join(directory, "state.json"),
    checkpoints: join(directory, "checkpoints"),
    sessions: join(directory, "sessions"),
    artifacts: join(directory, "artifacts"),
    reports: join(directory, "reports"),
    reviews: join(directory, "reviews"),
    capsules: join(directory, "capsules"),
  };
}

export async function ensureStoreBoundary(root, { create = true } = {}) {
  const paths = storePaths(root);
  const boundary = await ensureEvidenceStoreLayout(root, paths, { create });
  return { ...boundary, paths };
}

export async function prepareArtifactDirectory(root, checkpointId) {
  assertCheckpointId(checkpointId);
  const { paths } = await ensureStoreBoundary(root, { create: true });
  const directory = join(paths.artifacts, checkpointId);
  await ensurePhysicalDirectory(
    paths.artifacts,
    directory,
    "Checkpoint artifact directory",
  );
  return directory;
}

export async function prepareDefaultCapsuleDirectory(root) {
  const { paths } = await ensureStoreBoundary(root, { create: true });
  await ensurePhysicalDirectory(
    paths.directory,
    paths.capsules,
    "Capsule store directory",
  );
  return paths.capsules;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

async function writeJsonAtomic(path, value, label = "Evidence JSON file") {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    label,
  });
}

async function ensureLocalExclude(root) {
  const discoveredPath = runGit(root, [
    "rev-parse",
    "--git-path",
    "info/exclude",
  ]).trim();
  const excludePath = isAbsolute(discoveredPath)
    ? discoveredPath
    : resolve(root, discoveredPath);
  let existing = "";
  try {
    existing = await readFile(excludePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const required = [
    `/${STORE_DIRECTORY_NAME}/`,
    `/${LEGACY_STORE_DIRECTORY_NAME}/`,
  ];
  const lines = existing.split(/\r?\n/u);
  const missing = required.filter((line) => !lines.includes(line));
  if (missing.length === 0) return;

  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await writeFile(
    excludePath,
    `${existing}${separator}${missing.join("\n")}\n`,
    "utf8",
  );
}

function normalizeNewCheckpointRefs(checkpoint) {
  if (!checkpoint?.id?.startsWith("po_")) return checkpoint;
  for (const phase of ["before", "after"]) {
    const ref = checkpoint[phase]?.ref;
    if (typeof ref !== "string") continue;
    const legacyPrefix = `${LEGACY_REF_NAMESPACE}/checkpoints/`;
    if (ref.startsWith(legacyPrefix)) {
      checkpoint[phase].ref =
        `${REF_NAMESPACE}${ref.slice(LEGACY_REF_NAMESPACE.length)}`;
    }
  }
  return checkpoint;
}

export async function initializeStore(root) {
  const paths = storePaths(root);
  await ensureEvidenceStoreLayout(root, paths, { create: true });
  await ensureLocalExclude(root);

  let config = await readJson(paths.config);
  let created = false;
  if (!config) {
    const now = new Date().toISOString();
    config = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      currentSessionId: createId("session"),
      createdAt: now,
      visual: { viewport: { width: 1440, height: 900 }, waitMs: 350 },
    };
    assertSessionId(config.currentSessionId);
    await writeJsonAtomic(paths.config, config, "Evidence config file");
    await writeJsonAtomic(
      paths.state,
      {
        schemaVersion: 1,
        activeCheckpointId: null,
      },
      "Evidence state file",
    );
    await writeJsonAtomic(
      join(paths.sessions, `${config.currentSessionId}.json`),
      {
        schemaVersion: 1,
        id: config.currentSessionId,
        createdAt: now,
        updatedAt: now,
        checkpoints: [],
      },
      "Session evidence file",
    );
    created = true;
  }
  return { paths, config, created, legacyStore: paths.legacy };
}

export async function loadStore(root) {
  const initialized = await initializeStore(root);
  const state = await readJson(initialized.paths.state, {
    schemaVersion: 1,
    activeCheckpointId: null,
  });
  return { ...initialized, state };
}

export async function saveState(root, state) {
  const { paths } = await ensureStoreBoundary(root, { create: true });
  await writeJsonAtomic(paths.state, state, "Evidence state file");
}

export async function createSession(root, name = null) {
  const { paths, config } = await loadStore(root);
  const now = new Date().toISOString();
  const session = {
    schemaVersion: 1,
    id: createId("session"),
    name: name?.trim() || null,
    createdAt: now,
    updatedAt: now,
    checkpoints: [],
  };
  assertSessionId(session.id);
  config.currentSessionId = session.id;
  config.updatedAt = now;
  await writeJsonAtomic(paths.config, config, "Evidence config file");
  await writeJsonAtomic(
    join(paths.sessions, `${session.id}.json`),
    session,
    "Session evidence file",
  );
  return session;
}

export async function loadSession(root, id) {
  assertSessionId(id);
  const { paths } = await ensureStoreBoundary(root, { create: false });
  const session = await readJson(join(paths.sessions, `${id}.json`));
  if (!session) throw new Error(`Session ${id} was not found.`);
  return session;
}

export async function saveCheckpoint(root, checkpoint) {
  normalizeNewCheckpointRefs(checkpoint);
  if (!checkpoint.authorization) {
    checkpoint.authorization = runtimeChangeContract();
  }
  if (
    checkpoint.status === "completed" &&
    checkpoint.before?.commit &&
    checkpoint.after?.commit &&
    checkpoint.analysis
  ) {
    const storedVersion = checkpoint.receipt?.evidence?.version;
    const legacyReceipt = checkpoint.receipt?.receiptId?.startsWith("vtr_");
    checkpoint.receipt = createEvidenceReceipt(
      checkpoint,
      storedVersion
        ? { version: storedVersion, legacyPrefix: legacyReceipt }
        : undefined,
    );
  }
  assertValidCheckpoint(checkpoint);
  assertCheckpointId(checkpoint.id);
  const { paths } = await ensureStoreBoundary(root, { create: true });
  await writeJsonAtomic(
    join(paths.checkpoints, `${checkpoint.id}.json`),
    checkpoint,
    "Checkpoint evidence file",
  );
}

export async function loadCheckpoint(root, id) {
  assertCheckpointId(id);
  const { paths } = await ensureStoreBoundary(root, { create: false });
  const checkpoint = await readJson(join(paths.checkpoints, `${id}.json`));
  if (!checkpoint) throw new Error(`Checkpoint ${id} was not found.`);
  const validated = assertValidCheckpoint(checkpoint);
  setRuntimeChangeContract(validated.authorization || null);
  return validated;
}

export async function deleteCheckpoint(root, id) {
  assertCheckpointId(id);
  const { paths } = await ensureStoreBoundary(root, { create: false });
  await rm(join(paths.checkpoints, `${id}.json`), { force: true });
}

export async function listCheckpoints(root) {
  const { paths } = await ensureStoreBoundary(root, { create: false });
  let names = [];
  try {
    names = (await readdir(paths.checkpoints)).filter((name) =>
      Boolean(storageIdFromJsonFilename(name, CHECKPOINT_PREFIXES)),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const checkpoints = await Promise.all(
    names.map((name) => readJson(join(paths.checkpoints, name))),
  );
  return checkpoints
    .filter(Boolean)
    .map((checkpoint) => assertValidCheckpoint(checkpoint))
    .sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
}

export async function appendCheckpointToSession(root, sessionId, checkpointId) {
  assertSessionId(sessionId);
  assertCheckpointId(checkpointId);
  const { paths } = await ensureStoreBoundary(root, { create: true });
  const sessionPath = join(paths.sessions, `${sessionId}.json`);
  const session = (await readJson(sessionPath)) || {
    schemaVersion: 1,
    id: sessionId,
    createdAt: new Date().toISOString(),
    checkpoints: [],
  };
  if (!session.checkpoints.includes(checkpointId))
    session.checkpoints.push(checkpointId);
  session.updatedAt = new Date().toISOString();
  await writeJsonAtomic(sessionPath, session, "Session evidence file");
}

export async function removeCheckpointFromSession(
  root,
  sessionId,
  checkpointId,
) {
  assertSessionId(sessionId);
  assertCheckpointId(checkpointId);
  const { paths } = await ensureStoreBoundary(root, { create: false });
  const sessionPath = join(paths.sessions, `${sessionId}.json`);
  const session = await readJson(sessionPath);
  if (!session) return;
  session.checkpoints = session.checkpoints.filter((id) => id !== checkpointId);
  session.updatedAt = new Date().toISOString();
  await writeJsonAtomic(sessionPath, session, "Session evidence file");
}
