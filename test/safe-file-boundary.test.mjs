import { createTestSymlink } from "../test-support/helpers.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
import {
  publishSafeTemporaryFile,
  writeFileAtomic,
} from "../src/core/safe-file.mjs";
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

function runFileRace(root, mode) {
  // Isolate the filesystem interposition in a child process so concurrent
  // integration tests still use the real filesystem functions.
  const script = `
    import assert from "node:assert/strict";
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";
    import { join } from "node:path";
    const [root, mode, moduleUrl] = process.argv.slice(1);
    const path = join(root, "race.json");
    const originalOpen = fs.open;
    if (mode !== "failed-exclusive-open") await fs.writeFile(path, "original");
    fs.open = async (candidate, ...args) => {
      if (candidate !== path) return originalOpen(candidate, ...args);
      if (mode === "failed-exclusive-open") {
        await fs.writeFile(path, "competing writer");
        const error = new Error("Concurrent target cannot be opened");
        error.code = "EACCES";
        throw error;
      }
      if (mode === "replaced-before-open") {
        await fs.rename(path, path + ".original");
        await fs.writeFile(path, "replacement");
      }
      const handle = await originalOpen(candidate, ...args);
      if (mode === "replaced-after-open") {
        const originalStat = handle.stat.bind(handle);
        handle.stat = async (...statArgs) => {
          const stat = await originalStat(...statArgs);
          await fs.rename(path, path + ".original");
          await fs.writeFile(path, "replacement");
          return stat;
        };
      }
      return handle;
    };
    syncBuiltinESMExports();
    const { readFileSafe, writeFileAtomic } = await import(moduleUrl);
    if (mode === "failed-exclusive-open") {
      await assert.rejects(writeFileAtomic(path, "own data", { refuseOverwrite: true }), { code: "EACCES" });
      assert.equal(await fs.readFile(path, "utf8"), "competing writer");
    } else {
      await assert.rejects(readFileSafe(path, "utf8"), { code: "PATCHOATH_UNSAFE_FILE" });
      assert.equal(await fs.readFile(path, "utf8"), "replacement");
    }
  `;
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      script,
      root,
      mode,
      new URL("../src/core/safe-file.mjs", import.meta.url).href,
    ],
    { stdio: "pipe" },
  );
}

test("failed exclusive publication leaves a competing writer's file untouched", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-exclusive-race-");
  runFileRace(root, "failed-exclusive-open");
});

test("safe reads reject a regular file replaced between inspection and open", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-read-open-race-");
  runFileRace(root, "replaced-before-open");
});

test("safe reads reject a path replaced after its file handle opens", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-read-handle-race-");
  runFileRace(root, "replaced-after-open");
});

test("temporary publication refuses a source replaced by a symbolic link", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-publish-source-");
  const temporary = join(root, "reserved.tmp");
  const outside = join(root, "outside.json");
  const output = join(root, "artifact.json");
  await writeFile(outside, "sentinel", "utf8");
  await writeFile(output, "previous", "utf8");
  if (!(await createTestSymlink(context, outside, temporary))) return;
  await assert.rejects(
    publishSafeTemporaryFile(temporary, output),
    /Temporary evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel");
  assert.equal(await readFile(output, "utf8"), "previous");
});

test("atomic file publication refuses a pre-existing symbolic-link target", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-safe-target-");
  const outside = join(root, "outside.txt");
  const output = join(root, "output.json");
  await writeFile(outside, "sentinel\n", "utf8");
  if (!(await createTestSymlink(context, outside, output))) return;

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
  if (!(await createTestSymlink(context, outside, legacyTemporary))) return;

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
  if (!(await createTestSymlink(context, outside, path))) return;

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
  if (!(await createTestSymlink(context, outside, path))) return;

  await assert.rejects(
    saveHistoricalEffectReview(root, {
      recordId,
      recordedAt: "2026-09-08T00:00:00.000Z",
    }),
    /Historical review evidence file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel\n");
});
