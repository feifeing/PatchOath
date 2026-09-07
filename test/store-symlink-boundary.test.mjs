import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeManagedFileAtomic } from "../src/core/managed-file.mjs";
import { saveHistoricalEffectReview } from "../src/core/review-store.mjs";
import { CONFIG_SCHEMA_VERSION } from "../src/core/schema.mjs";
import {
  ensureStoreBoundary,
  initializeStore,
  prepareArtifactDirectory,
  prepareDefaultCapsuleDirectory,
  saveCheckpoint,
  storePaths,
} from "../src/core/store.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

async function assertMissing(path) {
  await assert.rejects(access(path), /ENOENT/u);
}

async function repository(context) {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function outsideDirectory(context, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function outsideFile(context, prefix = "patchoath-managed-file-") {
  const directory = await outsideDirectory(context, prefix);
  const path = join(directory, "sentinel.txt");
  await writeFile(path, "keep-me", "utf8");
  return path;
}

function checkpointFixture(root, id = "po_store_boundary_fixture") {
  const head = git(root, ["rev-parse", "HEAD"]);
  return {
    schemaVersion: 2,
    id,
    sessionId: "session_store_boundary_fixture",
    status: "recording",
    createdAt: "2026-09-07T10:00:00.000Z",
    completedAt: null,
    prompt: { text: "Guard the evidence store", source: "manual-cli" },
    authorization: null,
    repository: { name: "repo", branch: "main", head },
    before: { commit: head, capturedAt: "2026-09-07T10:00:00.000Z" },
    after: null,
    analysis: null,
    visual: null,
  };
}

test("a symlinked PatchOath store root is rejected before initialization writes", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(context, "patchoath-store-root-");
  await symlink(outside, join(root, ".patchoath"));

  await assert.rejects(
    initializeStore(root),
    /Evidence store directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("a symlinked checkpoint store cannot redirect checkpoint persistence", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(context, "patchoath-checkpoints-");
  const store = join(root, ".patchoath");
  await mkdir(store);
  await symlink(outside, join(store, "checkpoints"));

  const checkpoint = checkpointFixture(root);
  await assert.rejects(
    saveCheckpoint(root, checkpoint),
    /Checkpoint store directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("checkpoint artifact subdirectories cannot be symlinked outside the evidence store", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(
    context,
    "patchoath-artifact-checkpoint-",
  );
  await initializeStore(root);
  const paths = storePaths(root);
  const checkpointId = "po_artifact_symlink";
  await symlink(outside, join(paths.artifacts, checkpointId));

  await assert.rejects(
    prepareArtifactDirectory(root, checkpointId),
    /Checkpoint artifact directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("default capsule storage rejects a symlinked managed directory", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(context, "patchoath-capsules-");
  await initializeStore(root);
  const paths = storePaths(root);
  await symlink(outside, paths.capsules);

  await assert.rejects(
    prepareDefaultCapsuleDirectory(root),
    /Capsule store directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("historical review storage rejects a symlinked managed directory", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(context, "patchoath-reviews-");
  await initializeStore(root);
  const paths = storePaths(root);
  await symlink(outside, paths.reviews);

  await assert.rejects(
    saveHistoricalEffectReview(root, {
      recordId: "por_store_boundary_fixture",
    }),
    /Historical review store directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("physical legacy evidence stores remain supported", async (context) => {
  const root = await repository(context);
  const legacy = join(root, ".vibetrace");
  await mkdir(legacy);

  const initialized = await initializeStore(root);

  assert.equal(initialized.legacyStore, true);
  assert.equal(initialized.paths.directory, legacy);
  assert.equal(
    (await ensureStoreBoundary(root, { create: false })).exists,
    true,
  );
  assert.equal(
    JSON.parse(await readFile(initialized.paths.config, "utf8")).schemaVersion,
    CONFIG_SCHEMA_VERSION,
  );
  await assertMissing(join(root, ".patchoath"));
});

test("managed store boundary rejects a symlinked report directory even for non-report writes", async (context) => {
  const root = await repository(context);
  const outside = await outsideDirectory(context, "patchoath-reports-child-");
  const initialized = await initializeStore(root);
  await rm(initialized.paths.reports, { recursive: true, force: true });
  await symlink(outside, initialized.paths.reports);

  await assert.rejects(
    ensureStoreBoundary(root, { create: false }),
    /Report store directory must not be a symbolic link/iu,
  );
  await writeFile(join(outside, "sentinel.txt"), "untouched", "utf8");
  assert.equal(
    await readFile(join(outside, "sentinel.txt"), "utf8"),
    "untouched",
  );
});

test("managed atomic writes reject a symlink destination without touching its target", async (context) => {
  const directory = await outsideDirectory(
    context,
    "patchoath-managed-destination-",
  );
  const target = await outsideFile(context);
  const destination = join(directory, "evidence.json");
  await symlink(target, destination);

  await assert.rejects(
    writeManagedFileAtomic(destination, "replacement", {
      encoding: "utf8",
      label: "Test evidence file",
    }),
    /Test evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(target, "utf8"), "keep-me");
});

test("managed atomic writes do not reuse the old predictable pid temporary path", async (context) => {
  const directory = await outsideDirectory(context, "patchoath-managed-temp-");
  const target = await outsideFile(context);
  const destination = join(directory, "evidence.json");
  const predictableTemporary = `${destination}.${process.pid}.tmp`;
  await symlink(target, predictableTemporary);

  await writeManagedFileAtomic(destination, "safe-write", {
    encoding: "utf8",
  });

  assert.equal(await readFile(destination, "utf8"), "safe-write");
  assert.equal(await readFile(target, "utf8"), "keep-me");
  assert.equal((await lstat(predictableTemporary)).isSymbolicLink(), true);
});

test("checkpoint persistence rejects a pre-existing checkpoint file symlink", async (context) => {
  const root = await repository(context);
  const target = await outsideFile(context, "patchoath-checkpoint-file-");
  await initializeStore(root);
  const checkpoint = checkpointFixture(root, "po_checkpoint_file_symlink");
  const destination = join(
    storePaths(root).checkpoints,
    `${checkpoint.id}.json`,
  );
  await symlink(target, destination);

  await assert.rejects(
    saveCheckpoint(root, checkpoint),
    /Managed JSON evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(target, "utf8"), "keep-me");
});

test("historical review persistence rejects a pre-existing record file symlink", async (context) => {
  const root = await repository(context);
  const target = await outsideFile(context, "patchoath-review-file-");
  const initialized = await initializeStore(root);
  await mkdir(initialized.paths.reviews);
  const recordId = "por_review_file_symlink";
  const destination = join(initialized.paths.reviews, `${recordId}.json`);
  await symlink(target, destination);

  await assert.rejects(
    saveHistoricalEffectReview(root, { recordId }),
    /Historical review record must not be a symbolic link/iu,
  );
  assert.equal(await readFile(target, "utf8"), "keep-me");
});
