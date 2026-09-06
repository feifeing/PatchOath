import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createRepository } from "../test-support/helpers.mjs";
import {
  appendCheckpointToSession,
  deleteCheckpoint,
  initializeStore,
  listCheckpoints,
  loadCheckpoint,
  loadSession,
  storePaths,
} from "../src/core/store.mjs";
import {
  listHistoricalEffectReviews,
  saveHistoricalEffectReview,
} from "../src/core/review-store.mjs";
import {
  isPrefixedStorageId,
  isSafeStorageSegment,
  storageIdFromJsonFilename,
} from "../src/core/storage-key.mjs";

test("storage IDs are single safe repository-local path segments", () => {
  assert.equal(isSafeStorageSegment("po_20260907_ab12cd"), true);
  assert.equal(isPrefixedStorageId("po_20260907_ab12cd", ["po", "vt"]), true);
  assert.equal(isPrefixedStorageId("vt_legacy", ["po", "vt"]), true);
  assert.equal(storageIdFromJsonFilename("po_example.json", ["po"]), "po_example");

  for (const value of [
    "",
    ".",
    "..",
    "po_",
    "../outside",
    "..\\outside",
    "/tmp/outside",
    "C:\\temp\\outside",
    "po_safe/../outside",
    "po_safe\\..\\outside",
    "po_safe.json",
    "po_safe%2Foutside",
    "po_safe\u0000outside",
  ]) {
    assert.equal(
      isPrefixedStorageId(value, ["po", "vt"]),
      false,
      `expected ${JSON.stringify(value)} to be rejected`,
    );
  }
});

test("checkpoint and session store APIs reject path-like identifiers before filesystem access", async () => {
  const root = await createRepository();
  try {
    await initializeStore(root);
    const sentinel = join(root, "outside.json");
    await writeFile(sentinel, "do not delete\n", "utf8");

    for (const id of [
      "../../outside",
      "..\\..\\outside",
      "/tmp/outside",
      "po_safe/../outside",
      "po_",
    ]) {
      await assert.rejects(loadCheckpoint(root, id), /Invalid checkpoint ID/u);
      await assert.rejects(deleteCheckpoint(root, id), /Invalid checkpoint ID/u);
    }

    for (const id of [
      "../../outside",
      "..\\..\\outside",
      "/tmp/outside",
      "session_safe/../outside",
      "session_",
    ]) {
      await assert.rejects(loadSession(root, id), /Invalid session ID/u);
      await assert.rejects(
        appendCheckpointToSession(root, id, "po_example"),
        /Invalid session ID/u,
      );
    }

    assert.equal(await readFile(sentinel, "utf8"), "do not delete\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("store listings ignore unrelated JSON filenames instead of parsing them as evidence", async () => {
  const root = await createRepository();
  try {
    const { paths } = await initializeStore(root);
    await writeFile(join(paths.checkpoints, "notes.json"), "{not json", "utf8");
    await writeFile(join(paths.checkpoints, "po_.json"), "{not json", "utf8");
    assert.deepEqual(await listCheckpoints(root), []);

    const reviews = join(paths.directory, "reviews");
    await mkdir(reviews, { recursive: true });
    await writeFile(join(reviews, "notes.json"), "{not json", "utf8");
    await writeFile(join(reviews, "por_.json"), "{not json", "utf8");
    assert.deepEqual(await listHistoricalEffectReviews(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("historical review writes reject unsafe record IDs", async () => {
  const root = await createRepository();
  try {
    await initializeStore(root);
    for (const recordId of [
      "../../escape",
      "..\\..\\escape",
      "/tmp/escape",
      "por_safe/../escape",
      "por_",
    ]) {
      await assert.rejects(
        saveHistoricalEffectReview(root, { recordId }),
        /Invalid review record ID/u,
      );
    }

    const reviewDirectory = join(storePaths(root).directory, "reviews");
    await mkdir(reviewDirectory, { recursive: true });
    assert.deepEqual(await listHistoricalEffectReviews(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
