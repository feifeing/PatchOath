import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  inspectVisualArtifact,
  verifyVisualArtifact,
} from "../src/core/artifact-file.mjs";
import { initializeStore, storePaths } from "../src/core/store.mjs";
import { createRepository } from "../test-support/helpers.mjs";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("visual artifact resolver accepts only regular files inside the active evidence artifact root", async () => {
  const root = await createRepository();
  try {
    await initializeStore(root);
    const artifacts = storePaths(root).artifacts;
    const checkpointDirectory = join(artifacts, "po_artifact_boundary");
    await mkdir(checkpointDirectory, { recursive: true });

    const bytes = Buffer.from("trusted-artifact-bytes");
    const inside = join(checkpointDirectory, "..cache.png");
    await writeFile(inside, bytes);
    const verified = await verifyVisualArtifact(root, inside, digest(bytes));
    assert.equal(verified.status, "verified");

    const outside = join(root, "outside-secret.png");
    await writeFile(outside, bytes);
    const outsideCheck = await inspectVisualArtifact(root, outside);
    assert.equal(outsideCheck.status, "unsafe-path");

    const directoryCheck = await inspectVisualArtifact(root, checkpointDirectory);
    assert.equal(directoryCheck.status, "not-regular-file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "visual artifact resolver rejects a symlink that escapes the artifact root",
  { skip: process.platform === "win32" },
  async () => {
    const root = await createRepository();
    try {
      await initializeStore(root);
      const artifacts = storePaths(root).artifacts;
      const checkpointDirectory = join(artifacts, "po_artifact_symlink");
      await mkdir(checkpointDirectory, { recursive: true });

      const outside = join(root, "outside-secret.png");
      await writeFile(outside, "outside-secret\n", "utf8");
      const link = join(checkpointDirectory, "before.png");
      await symlink(outside, link);

      const checked = await inspectVisualArtifact(root, link);
      assert.equal(checked.status, "unsafe-path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
