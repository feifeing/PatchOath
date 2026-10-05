import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadActiveCheckpointAnchor } from "../core/active-checkpoint.mjs";
import { BRAND_NAME } from "../core/brand.mjs";
import { assertRepositoryAnchor, GitError, runGit } from "./git.mjs";

function snapshotIdentityEnv(indexPath) {
  const env = {
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || BRAND_NAME,
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "patchoath@local",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || BRAND_NAME,
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "patchoath@local",
  };
  if (indexPath) env.GIT_INDEX_FILE = indexPath;
  return env;
}

function assertHeadStable(root, expectedHead) {
  const actualHead = runGit(root, ["rev-parse", "--verify", "HEAD"]).trim();
  if (actualHead === expectedHead) return;
  throw new GitError(
    `Repository HEAD changed while PatchOath was capturing a Git snapshot. Expected ${expectedHead.slice(0, 12)}; current ${actualHead.slice(0, 12)}. Retry after repository history is stable.`,
  );
}

async function captureAnchor(root) {
  const active = await loadActiveCheckpointAnchor(root);
  if (!active) return null;
  assertRepositoryAnchor(
    root,
    active.repository,
    `capture active checkpoint ${active.checkpointId}`,
  );
  return active;
}

function assertCaptureAnchor(root, active, head) {
  if (active) {
    assertRepositoryAnchor(
      root,
      active.repository,
      `capture active checkpoint ${active.checkpointId}`,
    );
    return;
  }
  assertHeadStable(root, head);
}

function assertSubmoduleCoverage(root, env) {
  const entries = runGit(root, ["ls-files", "--stage", "-z"], { env });
  if (!entries.split("\0").some((entry) => entry.startsWith("160000 "))) return;
  const records = runGit(
    root,
    [
      "--no-optional-locks",
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ],
    { env },
  ).split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const [kind, , submodule] = records[index].split(" ", 3);
    if (kind !== "1" && kind !== "2") continue;
    if (
      submodule?.startsWith("S") &&
      (submodule[2] === "M" || submodule[3] === "U")
    ) {
      const error = new Error(
        "Cannot capture uncommitted submodule contents. Commit or discard changes inside submodules before capturing the parent repository; PatchOath captures submodule commit pointers only.",
      );
      error.code = "PATCHOATH_UNCAPTURED_SUBMODULE_CHANGES";
      throw error;
    }
    // A porcelain-v2 rename/copy has a second NUL-delimited pathname, not another record.
    if (kind === "2") index += 1;
  }
}

export async function createWorktreeSnapshot(root, label = "working tree") {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "patchoath-index-"));
  const temporaryIndex = join(temporaryDirectory, "index");
  const env = snapshotIdentityEnv(temporaryIndex);

  try {
    const active = await captureAnchor(root);
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    runGit(root, ["read-tree", "HEAD"], { env });
    runGit(root, ["add", "-A", "--", "."], { env });
    assertSubmoduleCoverage(root, env);
    const tree = runGit(root, ["write-tree"], { env }).trim();
    assertCaptureAnchor(root, active, head);
    const commit = runGit(
      root,
      [
        "commit-tree",
        tree,
        "-p",
        head,
        "-m",
        `${BRAND_NAME} snapshot: ${label}`,
      ],
      { env },
    ).trim();
    assertCaptureAnchor(root, active, head);
    return { commit, tree, head };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function createIndexSnapshot(root, label = "staged changes") {
  const head = runGit(root, ["rev-parse", "HEAD"]).trim();
  const tree = runGit(root, ["write-tree"]).trim();
  const env = snapshotIdentityEnv(process.env.GIT_INDEX_FILE);
  const commit = runGit(
    root,
    ["commit-tree", tree, "-p", head, "-m", `${BRAND_NAME} snapshot: ${label}`],
    { env },
  ).trim();
  assertHeadStable(root, head);
  return { commit, tree, head };
}
