import { lstat, mkdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  CHECKPOINT_ID_PREFIX,
  LEGACY_CHECKPOINT_ID_PREFIX,
} from "../core/brand.mjs";
import { assertPrefixedStorageId } from "../core/storage-key.mjs";
import { storePaths } from "../core/store.mjs";

const CHECKPOINT_PREFIXES = [CHECKPOINT_ID_PREFIX, LEGACY_CHECKPOINT_ID_PREFIX];

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

async function lstatIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function ensurePhysicalDirectory(parent, directory, label) {
  const resolvedParent = resolve(parent);
  const resolvedDirectory = resolve(directory);
  if (!isWithin(resolvedParent, resolvedDirectory)) {
    throw new Error(`${label} escapes its expected parent directory.`);
  }

  const parentReal = await realpath(resolvedParent);
  const existing = await lstatIfPresent(resolvedDirectory);
  if (existing?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  if (!existing) await mkdir(resolvedDirectory);

  const directoryReal = await realpath(resolvedDirectory);
  if (!isWithin(parentReal, directoryReal)) {
    throw new Error(`${label} resolves outside its expected parent directory.`);
  }
  return directoryReal;
}

export async function prepareReportOutput(root, checkpointId) {
  assertPrefixedStorageId(
    checkpointId,
    CHECKPOINT_PREFIXES,
    "report checkpoint ID",
  );

  const repositoryRoot = resolve(root);
  const paths = storePaths(root);
  const storeDirectory = resolve(paths.directory);
  const reportsDirectory = resolve(paths.reports);
  const reportDirectory = join(reportsDirectory, checkpointId);

  await ensurePhysicalDirectory(
    repositoryRoot,
    storeDirectory,
    "Evidence store directory",
  );
  await ensurePhysicalDirectory(
    storeDirectory,
    reportsDirectory,
    "Report root directory",
  );

  const existingReport = await lstatIfPresent(reportDirectory);
  if (existingReport?.isSymbolicLink()) {
    throw new Error("Checkpoint report directory must not be a symbolic link.");
  }
  if (existingReport && !existingReport.isDirectory()) {
    throw new Error("Checkpoint report path must be a directory.");
  }
  if (existingReport) {
    await rm(reportDirectory, { recursive: true, force: true });
  }
  await mkdir(reportDirectory);

  const reportsReal = await realpath(reportsDirectory);
  const reportReal = await realpath(reportDirectory);
  if (!isWithin(reportsReal, reportReal)) {
    throw new Error(
      "Checkpoint report directory resolved outside the report root.",
    );
  }

  const assetDirectory = join(reportDirectory, "assets");
  await mkdir(assetDirectory);
  const assetsReal = await realpath(assetDirectory);
  if (!isWithin(reportReal, assetsReal)) {
    throw new Error(
      "Report asset directory resolved outside the checkpoint report.",
    );
  }

  return { reportDirectory, assetDirectory };
}

export function assertReportCheckpointIds(checkpoints) {
  for (const checkpoint of checkpoints) {
    assertPrefixedStorageId(
      checkpoint?.id,
      CHECKPOINT_PREFIXES,
      "report checkpoint ID",
    );
  }
}
