import { copyFile, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { storePaths } from "../core/store.mjs";

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function bump(audit, key) {
  if (!audit) return;
  audit[key] = (audit[key] || 0) + 1;
}

function blocked(audit, reason) {
  bump(audit, "blocked");
  if (audit?.reasons) audit.reasons[reason] = (audit.reasons[reason] || 0) + 1;
  return { copied: false, status: "blocked", reason };
}

function missing(audit) {
  bump(audit, "missing");
  return { copied: false, status: "missing", reason: "source-unavailable" };
}

export function createReportAssetAudit() {
  return {
    policy: "evidence-store-artifacts-only",
    accepted: 0,
    missing: 0,
    blocked: 0,
    sourcePathsDisclosed: false,
    reasons: {},
  };
}

export async function copyReportEvidenceAsset(
  root,
  source,
  destination,
  audit = null,
) {
  if (typeof source !== "string" || source.length === 0) {
    return blocked(audit, "invalid-source-path");
  }

  const repositoryRoot = resolve(root);
  const artifactsRoot = resolve(storePaths(root).artifacts);
  const sourcePath = isAbsolute(source)
    ? resolve(source)
    : resolve(root, source);

  if (!isWithin(artifactsRoot, sourcePath)) {
    return blocked(audit, "outside-artifacts-root");
  }

  let realRepositoryRoot;
  let realArtifactsRoot;
  let realSource;
  try {
    [realRepositoryRoot, realArtifactsRoot, realSource] = await Promise.all([
      realpath(repositoryRoot),
      realpath(artifactsRoot),
      realpath(sourcePath),
    ]);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR")
      return missing(audit);
    throw error;
  }

  if (!isWithin(realRepositoryRoot, realArtifactsRoot)) {
    return blocked(audit, "artifacts-root-escape");
  }
  if (!isWithin(realArtifactsRoot, realSource)) {
    return blocked(audit, "symlink-escape");
  }

  let metadata;
  try {
    metadata = await stat(realSource);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR")
      return missing(audit);
    throw error;
  }
  if (!metadata.isFile()) return blocked(audit, "non-file-source");

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(realSource, destination);
  bump(audit, "accepted");
  return { copied: true, status: "accepted", reason: null };
}
