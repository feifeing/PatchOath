import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

async function lstatIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function assertSafeFileTarget(
  path,
  label = "Output file",
  { allowExisting = true } = {},
) {
  const existing = await lstatIfPresent(path);
  if (!existing) return { exists: false, path };
  if (existing.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (!existing.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (!allowExisting) {
    const error = new Error(`${label} already exists: ${path}`);
    error.code = "EEXIST";
    throw error;
  }
  return { exists: true, path };
}

async function createExclusiveSibling(path) {
  const directory = dirname(path);
  const name = basename(path);
  await mkdir(directory, { recursive: true });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const temporaryPath = join(
      directory,
      `.${name}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      return { handle, temporaryPath };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not reserve a temporary file beside ${path}.`);
}

export async function writeFileAtomic(
  path,
  data,
  { encoding = undefined, label = "Output file", refuseOverwrite = false } = {},
) {
  if (refuseOverwrite) {
    await mkdir(dirname(path), { recursive: true });
    await assertSafeFileTarget(path, label, { allowExisting: false });
    let handle;
    try {
      handle = await open(path, "wx", 0o600);
      await handle.writeFile(data, encoding ? { encoding } : undefined);
      await handle.sync();
      await handle.close();
      return path;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (error.code === "EEXIST") {
        throw new Error(`${label} already exists: ${path}`);
      }
      await rm(path, { force: true }).catch(() => {});
      throw error;
    }
  }

  await assertSafeFileTarget(path, label, { allowExisting: true });
  const { handle, temporaryPath } = await createExclusiveSibling(path);
  try {
    await handle.writeFile(data, encoding ? { encoding } : undefined);
    await handle.sync();
    await handle.close();
    await assertSafeFileTarget(path, label, { allowExisting: true });
    await rename(temporaryPath, path);
    return path;
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function reserveSafeTemporaryFile(path) {
  const { handle, temporaryPath } = await createExclusiveSibling(path);
  await handle.close();
  return temporaryPath;
}

export async function publishSafeTemporaryFile(
  temporaryPath,
  path,
  label = "Output file",
) {
  await assertSafeFileTarget(path, label, { allowExisting: true });
  await rename(temporaryPath, path);
  return path;
}
