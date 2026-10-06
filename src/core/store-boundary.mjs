import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

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

export async function ensurePhysicalDirectory(
  parent,
  directory,
  label,
  { create = true } = {},
) {
  const resolvedParent = resolve(parent);
  const resolvedDirectory = resolve(directory);
  if (!isWithin(resolvedParent, resolvedDirectory)) {
    throw new Error(`${label} escapes its expected parent directory.`);
  }

  const parentReal = await realpath(resolvedParent);
  let existing = await lstatIfPresent(resolvedDirectory);
  if (!existing && !create) {
    return { exists: false, path: resolvedDirectory, realPath: null };
  }
  if (existing?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  if (!existing) {
    await mkdir(resolvedDirectory);
    existing = await lstat(resolvedDirectory);
  }

  const directoryReal = await realpath(resolvedDirectory);
  if (!isWithin(parentReal, directoryReal)) {
    throw new Error(`${label} resolves outside its expected parent directory.`);
  }
  return { exists: true, path: resolvedDirectory, realPath: directoryReal };
}

export async function ensureEvidenceStoreLayout(
  root,
  paths,
  { create = true } = {},
) {
  const store = await ensurePhysicalDirectory(
    root,
    paths.directory,
    "Evidence store directory",
    { create },
  );
  if (!store.exists) return { exists: false, paths };

  for (const [key, label] of [
    ["checkpoints", "Checkpoint store directory"],
    ["sessions", "Session store directory"],
    ["artifacts", "Artifact store directory"],
    ["reports", "Report store directory"],
  ]) {
    await ensurePhysicalDirectory(paths.directory, paths[key], label, {
      create,
    });
  }
  return { exists: true, paths };
}
