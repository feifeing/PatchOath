import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHECKPOINT_ID_PREFIX,
  LEGACY_CHECKPOINT_ID_PREFIX,
  LEGACY_STORE_DIRECTORY_NAME,
  STORE_DIRECTORY_NAME,
} from "./brand.mjs";
import { assertValidCheckpoint } from "./schema.mjs";
import { assertPrefixedStorageId } from "./storage-key.mjs";

const CHECKPOINT_PREFIXES = [CHECKPOINT_ID_PREFIX, LEGACY_CHECKPOINT_ID_PREFIX];

function selectedStoreDirectory(root) {
  const preferred = join(root, STORE_DIRECTORY_NAME);
  const legacy = join(root, LEGACY_STORE_DIRECTORY_NAME);
  if (existsSync(preferred)) return preferred;
  if (existsSync(legacy)) return legacy;
  return null;
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

export async function loadActiveCheckpointAnchor(root) {
  const directory = selectedStoreDirectory(root);
  if (!directory) return null;

  const state = await readJsonIfPresent(join(directory, "state.json"));
  const checkpointId = state?.activeCheckpointId;
  if (!checkpointId) return null;

  assertPrefixedStorageId(
    checkpointId,
    CHECKPOINT_PREFIXES,
    "active checkpoint ID",
  );
  const checkpoint = await readJsonIfPresent(
    join(directory, "checkpoints", `${checkpointId}.json`),
  );
  if (!checkpoint) {
    throw new Error(
      `Active checkpoint ${checkpointId} is missing from the repository-local evidence store.`,
    );
  }

  const validated = assertValidCheckpoint(checkpoint);
  if (validated.status !== "recording") {
    throw new Error(
      `Active checkpoint ${checkpointId} is not recording; repository-local state is inconsistent.`,
    );
  }

  return {
    checkpointId,
    repository: validated.repository,
  };
}
