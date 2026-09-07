import { randomUUID } from "node:crypto";
import { lstat, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

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
