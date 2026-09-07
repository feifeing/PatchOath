import { randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

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

export async function assertManagedFileDestination(
  path,
  label = "Managed evidence file",
) {
  const existing = await lstatIfPresent(path);
  if (existing?.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (existing && !existing.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  return existing;
}

export async function readManagedFile(
  path,
  {
    encoding = undefined,
    label = "Managed evidence file",
    within = null,
  } = {},
) {
  const resolvedPath = resolve(path);
  if (within) {
    const resolvedParent = resolve(within);
    if (!isWithin(resolvedParent, resolvedPath)) {
      throw new Error(`${label} escapes its managed directory.`);
    }
  }

  const existing = await lstatIfPresent(resolvedPath);
  if (!existing) return readFile(resolvedPath, encoding);
  if (existing.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (!existing.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }

  if (within) {
    const parentReal = await realpath(resolve(within));
    const fileReal = await realpath(resolvedPath);
    if (!isWithin(parentReal, fileReal)) {
      throw new Error(`${label} resolves outside its managed directory.`);
    }
  }
  return readFile(resolvedPath, encoding);
}

export async function writeManagedFileAtomic(
  path,
  data,
  { encoding = undefined, label = "Managed evidence file" } = {},
) {
  await assertManagedFileDestination(path, label);
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, data, {
      encoding,
      flag: "wx",
    });
    await assertManagedFileDestination(path, label);
    await rename(temporaryPath, path);
    return path;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
