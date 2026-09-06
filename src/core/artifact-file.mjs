import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { storePaths } from "./store.mjs";

function isWithin(base, candidate) {
  const rel = relative(base, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function recordedAbsolutePath(root, recordedPath) {
  return isAbsolute(recordedPath)
    ? resolve(recordedPath)
    : resolve(root, recordedPath);
}

export async function inspectVisualArtifact(root, recordedPath) {
  if (typeof recordedPath !== "string" || recordedPath.trim() === "") {
    return { status: "unsafe-path", recordedPath: recordedPath || null };
  }

  const artifactRoot = resolve(storePaths(root).artifacts);
  const candidate = recordedAbsolutePath(root, recordedPath);
  if (!isWithin(artifactRoot, candidate)) {
    return { status: "unsafe-path", recordedPath };
  }

  let stat;
  try {
    stat = await lstat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { status: "missing", recordedPath };
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    return { status: "unsafe-path", recordedPath };
  }
  if (!stat.isFile()) {
    return { status: "not-regular-file", recordedPath };
  }

  let realArtifactRoot;
  let realCandidate;
  try {
    [realArtifactRoot, realCandidate] = await Promise.all([
      realpath(artifactRoot),
      realpath(candidate),
    ]);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { status: "missing", recordedPath };
    }
    throw error;
  }

  if (!isWithin(realArtifactRoot, realCandidate)) {
    return { status: "unsafe-path", recordedPath };
  }

  return {
    status: "accessible",
    recordedPath,
    path: realCandidate,
  };
}

export async function verifyVisualArtifact(
  root,
  recordedPath,
  expectedSha256,
) {
  const inspected = await inspectVisualArtifact(root, recordedPath);
  if (inspected.status !== "accessible") return inspected;

  const bytes = await readFile(inspected.path);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (typeof expectedSha256 !== "string" || expectedSha256.length === 0) {
    return {
      status: "missing-hash",
      recordedPath,
      path: inspected.path,
      actualSha256,
      expectedSha256: expectedSha256 || null,
    };
  }

  return {
    status: actualSha256 === expectedSha256 ? "verified" : "mismatch",
    recordedPath,
    path: inspected.path,
    actualSha256,
    expectedSha256,
  };
}
