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
    "Repository HEAD changed while PatchOath was capturing a Git snapshot.",
    `expected ${expectedHead.slice(0, 12)}; current ${actualHead.slice(0, 12)}. Retry after repository history is stable.`,
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

export async function createWorktreeSnapshot(root, label = "working tree") {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "patchoath-index-"));
  const temporaryIndex = join(temporaryDirectory, "index");
  const env = snapshotIdentityEnv(temporaryIndex);

  try {
    const active = await captureAnchor(root);
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    runGit(root, ["read-tree", "HEAD"], { env });
    runGit(root, ["add", "-A", "--", "."], { env });
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
