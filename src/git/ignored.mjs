import { createHash } from "node:crypto";
import {
  LEGACY_STORE_DIRECTORY_NAME,
  STORE_DIRECTORY_NAME,
} from "../core/brand.mjs";
import { runGit } from "./git.mjs";

const INTERNAL_STORE_ROOTS = new Set([
  STORE_DIRECTORY_NAME,
  LEGACY_STORE_DIRECTORY_NAME,
]);

function normalizePath(value) {
  let path = String(value || "").replaceAll("\\", "/");
  while (path.startsWith("./")) path = path.slice(2);
  while (path.endsWith("/") && path.length > 1) path = path.slice(0, -1);
  return path;
}

function isInternalStorePath(path) {
  const normalized = normalizePath(path);
  for (const root of INTERNAL_STORE_ROOTS) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return true;
  }
  return false;
}

function digestPaths(paths) {
  return createHash("sha256").update(paths.join("\0")).digest("hex");
}

export function parseIgnoredStatus(output = "") {
  const paths = [];
  for (const token of String(output).split("\0")) {
    if (!token.startsWith("!! ")) continue;
    const path = normalizePath(token.slice(3));
    if (!path || isInternalStorePath(path)) continue;
    paths.push(path);
  }
  return [...new Set(paths)].sort();
}

export function collectIgnoredWorktreeState(root) {
  const output = runGit(root, [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=normal",
    "-z",
    "--",
    ".",
  ]);
  const paths = parseIgnoredStatus(output);
  return {
    mode: "git-status-ignored-matching",
    roots: paths.length,
    rootSetSha256: digestPaths(paths),
    pathNamesStored: false,
    contentCaptured: false,
  };
}

export function ignoredEvidenceCoverage(root) {
  const state = collectIgnoredWorktreeState(root);
  return {
    gitSnapshot: {
      trackedContentCaptured: true,
      untrackedNonIgnoredContentCaptured: true,
      ignoredContentCaptured: false,
    },
    ignoredWorktree: {
      policy: "excluded",
      rootsDetected: state.roots,
      rootSetSha256: state.rootSetSha256,
      pathNamesStored: state.pathNamesStored,
      contentCaptured: state.contentCaptured,
      receiptBound: false,
      limitation:
        state.roots > 0
          ? "Git-ignored path contents are outside the snapshot. The root-set digest records ignored-root presence only and cannot prove ignored contents were unchanged."
          : "No non-PatchOath ignored roots were reported at analysis time, but ignored content remains outside the snapshot policy.",
    },
  };
}

export function ignoredCoverageWarning(root) {
  const state = collectIgnoredWorktreeState(root);
  if (state.roots === 0) return null;
  const noun = state.roots === 1 ? "root" : "roots";
  return `evidence coverage excludes ${state.roots} Git-ignored path ${noun}; ignored contents are not snapshotted or bound by Evidence Receipt v2. Presence alone does not mean they changed.`;
}
