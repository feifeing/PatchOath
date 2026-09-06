import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND_NAME } from "../core/brand.mjs";
import { runGit } from "./git.mjs";

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

export async function createWorktreeSnapshot(root, label = "working tree") {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "patchoath-index-"));
  const temporaryIndex = join(temporaryDirectory, "index");
  const env = snapshotIdentityEnv(temporaryIndex);

  try {
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    runGit(root, ["read-tree", "HEAD"], { env });
    runGit(root, ["add", "-A", "--", "."], { env });
    const tree = runGit(root, ["write-tree"], { env }).trim();
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
  return { commit, tree, head };
}
