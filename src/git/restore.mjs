import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectCommitDiff } from "./diff.mjs";
import { runGit } from "./git.mjs";
import { createWorktreeSnapshot } from "./snapshot.mjs";

export async function inspectRestore(root, checkpoint) {
  if (checkpoint.status !== "completed" || !checkpoint.after?.commit) {
    throw new Error("Only completed checkpoints can be restored.");
  }

  const current = await createWorktreeSnapshot(
    root,
    `${checkpoint.id} restore guard`,
  );
  const drift = collectCommitDiff(
    root,
    checkpoint.after.commit,
    current.commit,
  );
  const restore = collectCommitDiff(
    root,
    checkpoint.after.commit,
    checkpoint.before.commit,
  );

  return {
    checkpointId: checkpoint.id,
    from: checkpoint.after.commit,
    to: checkpoint.before.commit,
    current: current.commit,
    drift,
    restore,
    canApply: drift.length === 0,
  };
}

export async function applyRestore(root, plan) {
  if (!plan?.canApply) {
    throw new Error(
      "Restore is blocked because the current worktree has drifted since the checkpoint after-state.",
    );
  }

  const current = await createWorktreeSnapshot(
    root,
    `${plan.checkpointId} pre-apply restore guard`,
  );
  const lateDrift = collectCommitDiff(root, plan.from, current.commit);
  if (lateDrift.length > 0) {
    throw new Error(
      "Restore is blocked because the worktree changed after the restore plan was created.",
    );
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "patchoath-restore-"),
  );
  const temporaryIndex = join(temporaryDirectory, "index");
  const env = { GIT_INDEX_FILE: temporaryIndex };

  try {
    runGit(root, ["read-tree", plan.from], { env });
    runGit(root, ["read-tree", "--reset", "-u", plan.to], { env });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const verification = await createWorktreeSnapshot(
    root,
    `${plan.checkpointId} restored verification`,
  );
  const remaining = collectCommitDiff(root, plan.to, verification.commit);
  if (remaining.length > 0) {
    throw new Error(
      "Restore command completed, but the resulting worktree does not match the checkpoint before-state.",
    );
  }

  return { ...plan, applied: true, verification: verification.commit };
}
