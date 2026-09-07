import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveHistoricalEffectReview } from "../src/core/review-store.mjs";
import { writeFileAtomic } from "../src/core/safe-file.mjs";
import {
  initializeStore,
  saveCheckpoint,
  storePaths,
} from "../src/core/store.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

async function temporaryDirectory(context, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function checkpointFixture(root, id) {
  const head = git(root, ["rev-parse", "HEAD"]);
  return {
    schemaVersion: 2,
    id,
    sessionId: "session_safe_file_fixture",
    status: "recording",
    createdAt: "2026-09-08T00:00:00.000Z",
    completedAt: null,
    prompt: { text: "Harden evidence files", source: "manual-cli" },
    authorization: null,
    repository: { name: "repo", branch: "main", head },
    before: { commit: head, capturedAt: "2026-09-08T00:00:00.000Z" },
    after: null,
    analysis: null,
    visual: null,
  };
}

test("atomic file publication refuses a pre-existing symbolic-link target", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-safe-target-");
  const outside = join(root, "outside.txt");
  const output = join(root, "output.json");
  await writeFile(outside, "sentinel\n", "utf8");
  await symlink(outside, output);

  await assert.rejects(
    writeFileAtomic(output, "replacement\n", {
      encoding: "utf8",
      label: "Evidence file",
    }),
    /Evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel\n");
});

test("atomic file publication no longer uses the predictable pid temporary name", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-safe-temp-");
  const outside = join(root, "outside.txt");
  const output = join(root, "state.json");
  const legacyTemporary = `${output}.${process.pid}.tmp`;
  await writeFile(outside, "sentinel\n", "utf8");
  await symlink(outside, legacyTemporary);

  await writeFileAtomic(output, "safe\n", {
    encoding: "utf8",
    label: "Evidence file",
  });

  assert.equal(await readFile(output, "utf8"), "safe\n");
  assert.equal(await readFile(outside, "utf8"), "sentinel\n");
});

test("checkpoint persistence refuses a symbolic-link evidence file", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeStore(root);
  const id = "po_safe_file_checkpoint";
  const path = join(storePaths(root).checkpoints, `${id}.json`);
  const outside = join(root, "outside-checkpoint.json");
  await writeFile(outside, "sentinel\n", "utf8");
  await symlink(outside, path);

  await assert.rejects(
    saveCheckpoint(root, checkpointFixture(root, id)),
    /Checkpoint evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel\n");
});

test("historical review persistence refuses a symbolic-link evidence file", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeStore(root);
  const recordId = "por_safe_file_review";
  const reviews = join(storePaths(root).directory, "reviews");
  const path = join(reviews, `${recordId}.json`);
  const outside = join(root, "outside-review.json");
  await mkdir(reviews, { recursive: true });
  await writeFile(outside, "sentinel\n", "utf8");
  await symlink(outside, path);

  await assert.rejects(
    saveHistoricalEffectReview(root, {
      recordId,
      recordedAt: "2026-09-08T00:00:00.000Z",
    }),
    /Historical review evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel\n");
});
