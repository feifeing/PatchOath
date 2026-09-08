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
import { readFileSafe, writeFileAtomic } from "./safe-file.mjs";
import {
  CONFIG_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  assertValidCheckpoint,
  assertValidConfig,
  assertValidSession,
  assertValidState,
} from "./schema.mjs";
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

function assertStoredIdentity(kind, expectedId, actualId) {
  if (expectedId === actualId) return actualId;
  const error = new Error(
    `${kind} storage identity mismatch: expected ${expectedId}, found ${String(actualId || "<missing>")}.`,
  );
  error.code = "PATCHOATH_EVIDENCE_IDENTITY_MISMATCH";
  throw error;
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

export async function inspectArtifactDirectory(root, checkpointId) {
  assertCheckpointId(checkpointId);
  const boundary = await ensureStoreBoundary(root, { create: false });
  if (!boundary.exists) {
    return {
      exists: false,
      directory: join(boundary.paths.artifacts, checkpointId),
    };
  }
  const directory = join(boundary.paths.artifacts, checkpointId);
  const result = await ensurePhysicalDirectory(
    boundary.paths.artifacts,
    directory,
    "Checkpoint artifact directory",
    { create: false },
  );
  return { exists: result.exists, directory };
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

async function readJson(path, fallback = null, label = "Evidence JSON file") {
  try {
    return JSON.parse(await readFileSafe(path, "utf8", label));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (error.code === "PATCHOATH_UNSAFE_FILE") throw error;
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

function initialState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    activeCheckpointId: null,
  };
}

function initialSession(id, now) {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    checkpoints: [],
  };
}

export async function initializeStore(root) {
  const paths = storePaths(root);
  await ensureEvidenceStoreLayout(root, paths, { create: true });
  await ensureLocalExclude(root);

  let config = await readJson(paths.config, null, "Evidence config file");
  let created = false;
  if (!config) {
    const now = new Date().toISOString();
    config = assertValidConfig({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      currentSessionId: createId("session"),
      createdAt: now,
      visual: { viewport: { width: 1440, height: 900 }, waitMs: 350 },
    });
    const state = assertValidState(initialState());
    const session = assertValidSession(
      initialSession(config.currentSessionId, now),
    );
    await writeJsonAtomic(paths.config, config, "Evidence config file");
    await writeJsonAtomic(paths.state, state, "Evidence state file");
    await writeJsonAtomic(
      join(paths.sessions, `${session.id}.json`),
      session,
      "Session evidence file",
    );
    created = true;
  } else {
    config = assertValidConfig(config);
  }
  return { paths, config, created, legacyStore: paths.legacy };
}

export async function inspectStore(root) {
  const boundary = await ensureStoreBoundary(root, { create: false });
  if (!boundary.exists) {
    return {
      exists: false,
      paths: boundary.paths,
      config: null,
      state: null,
      legacyStore: boundary.paths.legacy,
    };
  }
  const config = await readJson(
    boundary.paths.config,
    null,
    "Evidence config file",
  );
  const state = await readJson(
    boundary.paths.state,
    null,
    "Evidence state file",
  );
  if (!config) throw new Error("Evidence config file was not found.");
  if (!state) throw new Error("Evidence state file was not found.");
  return {
    exists: true,
    paths: boundary.paths,
    config: assertValidConfig(config),
    state: assertValidState(state),
    legacyStore: boundary.paths.legacy,
  };
}

export async function loadStore(root) {
  const initialized = await initializeStore(root);
  const state = assertValidState(
    await readJson(
      initialized.paths.state,
      initialState(),
      "Evidence state file",
    ),
  );
  return { ...initialized, state };
}

export async function saveState(root, state) {
  const validated = assertValidState(state);
  const { paths } = await ensureStoreBoundary(root, { create: true });
  await writeJsonAtomic(paths.state, validated, "Evidence state file");
}

export async function createSession(root, name = null) {
  const { paths, config } = await loadStore(root);
  const now = new Date().toISOString();
  const session = assertValidSession({
    ...initialSession(createId("session"), now),
    name: name?.trim() || null,
  });
  config.currentSessionId = session.id;
  config.updatedAt = now;
  assertValidConfig(config);
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
  const session = await readJson(
    join(paths.sessions, `${id}.json`),
    null,
    "Session evidence file",
  );
  if (!session) throw new Error(`Session ${id} was not found.`);
  const validated = assertValidSession(session);
  assertStoredIdentity("Session", id, validated.id);
  return validated;
}

export async function listSessions(root) {
  const { paths } = await ensureStoreBoundary(root, { create: false });
  let names = [];
  try {
    names = (await readdir(paths.sessions)).filter((name) =>
      Boolean(storageIdFromJsonFilename(name, SESSION_PREFIXES)),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sessions = await Promise.all(
    names.map(async (name) => {
      const id = storageIdFromJsonFilename(name, SESSION_PREFIXES);
      const stored = await readJson(
        join(paths.sessions, name),
        null,
        "Session evidence file",
      );
      if (!stored) return null;
      const validated = assertValidSession(stored);
      assertStoredIdentity("Session", id, validated.id);
      return validated;
    }),
  );
  return sessions
    .filter(Boolean)
    .sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
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
  const checkpoint = await readJson(
    join(paths.checkpoints, `${id}.json`),
    null,
    "Checkpoint evidence file",
  );
  if (!checkpoint) throw new Error(`Checkpoint ${id} was not found.`);
  const validated = assertValidCheckpoint(checkpoint);
  assertStoredIdentity("Checkpoint", id, validated.id);
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
    names.map(async (name) => {
      const id = storageIdFromJsonFilename(name, CHECKPOINT_PREFIXES);
      const stored = await readJson(
        join(paths.checkpoints, name),
        null,
        "Checkpoint evidence file",
      );
      if (!stored) return null;
      const validated = assertValidCheckpoint(stored);
      assertStoredIdentity("Checkpoint", id, validated.id);
      return validated;
    }),
  );
  return checkpoints
    .filter(Boolean)
    .sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
}

export async function appendCheckpointToSession(root, sessionId, checkpointId) {
  assertSessionId(sessionId);
  assertCheckpointId(checkpointId);
  const { paths } = await ensureStoreBoundary(root, { create: true });
  const sessionPath = join(paths.sessions, `${sessionId}.json`);
  const stored = await readJson(sessionPath, null, "Session evidence file");
  const session = assertValidSession(
    stored || initialSession(sessionId, new Date().toISOString()),
  );
  assertStoredIdentity("Session", sessionId, session.id);
  if (!session.checkpoints.includes(checkpointId)) {
    session.checkpoints.push(checkpointId);
  }
  session.updatedAt = new Date().toISOString();
  assertValidSession(session);
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
  const stored = await readJson(sessionPath, null, "Session evidence file");
  if (!stored) return;
  const session = assertValidSession(stored);
  assertStoredIdentity("Session", sessionId, session.id);
  session.checkpoints = session.checkpoints.filter((id) => id !== checkpointId);
  session.updatedAt = new Date().toISOString();
  assertValidSession(session);
  await writeJsonAtomic(sessionPath, session, "Session evidence file");
}
