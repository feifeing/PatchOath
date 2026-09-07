import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { createEvidenceReceipt } from "../src/core/receipt.mjs";
import { listHistoricalEffectReviews } from "../src/core/review-store.mjs";
import { readFileSafe } from "../src/core/safe-file.mjs";
import {
  initializeStore,
  loadCheckpoint,
  saveCheckpoint,
  storePaths,
} from "../src/core/store.mjs";
import { runVerify } from "../src/verify.mjs";
import {
  createRepository,
  git,
  memoryStream,
} from "../test-support/helpers.mjs";

async function temporaryDirectory(context, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function checkpointFixture(root, sessionId, id = "po_read_boundary_fixture") {
  const head = git(root, ["rev-parse", "HEAD"]);
  const checkpoint = {
    schemaVersion: 2,
    id,
    sessionId,
    status: "completed",
    createdAt: "2026-09-08T00:00:00.000Z",
    completedAt: "2026-09-08T00:01:00.000Z",
    prompt: { text: "Verify managed evidence reads", source: "manual-cli" },
    authorization: null,
    repository: { head },
    before: { commit: head },
    after: { commit: head },
    analysis: {
      files: [],
      summary: { filesChanged: 0, linesChanged: 0, modulesChanged: 0 },
      contractCompliance: {
        declared: false,
        status: "not-declared",
        violations: [],
      },
      blastRadius: { score: 0, level: "contained" },
      risk: { score: 0, level: "low", factors: [] },
    },
    visual: null,
  };
  for (const phase of ["before", "after"]) {
    const ref = `refs/patchoath/checkpoints/${id}/${phase}`;
    git(root, ["update-ref", ref, head]);
    checkpoint[phase].ref = ref;
  }
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  return checkpoint;
}

test("safe managed-file reads refuse a symbolic link", async (context) => {
  const root = await temporaryDirectory(context, "patchoath-read-link-");
  const outside = join(root, "outside.json");
  const link = join(root, "evidence.json");
  await writeFile(outside, '{"secret":true}\n', "utf8");
  await symlink(outside, link);

  await assert.rejects(
    readFileSafe(link, "utf8", "Managed evidence file"),
    /Managed evidence file must not be a symbolic link/iu,
  );
});

test("store initialization refuses a symlinked config file", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, "outside-config.json");
  const store = join(root, ".patchoath");
  await mkdir(store);
  await writeFile(
    outside,
    '{"schemaVersion":1,"currentSessionId":"session_outside"}\n',
    "utf8",
  );
  await symlink(outside, join(store, "config.json"));

  await assert.rejects(
    initializeStore(root),
    /Evidence config file must not be a symbolic link/iu,
  );
  assert.match(await readFile(outside, "utf8"), /session_outside/u);
});

test("checkpoint loading refuses a symlinked checkpoint evidence file", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(
    root,
    config.currentSessionId,
    "po_read_symlink_checkpoint",
  );
  const paths = storePaths(root);
  const outside = join(root, "outside-checkpoint.json");
  await writeFile(outside, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await symlink(outside, join(paths.checkpoints, `${checkpoint.id}.json`));

  await assert.rejects(
    loadCheckpoint(root, checkpoint.id),
    /Checkpoint evidence file must not be a symbolic link/iu,
  );
});

test("historical review listing refuses a symlinked review record", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeStore(root);
  const paths = storePaths(root);
  await mkdir(paths.reviews, { recursive: true });
  const outside = join(root, "outside-review.json");
  await writeFile(
    outside,
    '{"recordId":"por_read_link","recordedAt":"2026-09-08T00:00:00.000Z"}\n',
    "utf8",
  );
  await symlink(outside, join(paths.reviews, "por_read_link.json"));

  await assert.rejects(
    listHistoricalEffectReviews(root),
    /Historical review evidence file must not be a symbolic link/iu,
  );
});

test("verify refuses an artifact path outside the checkpoint artifact directory", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(
    root,
    config.currentSessionId,
    "po_verify_outside_artifact",
  );
  const paths = storePaths(root);
  const artifactDirectory = join(paths.artifacts, checkpoint.id);
  await mkdir(artifactDirectory, { recursive: true });
  const outside = join(root, "outside-visual.bin");
  const bytes = Buffer.from("outside visual evidence");
  await writeFile(outside, bytes);
  checkpoint.visual = {
    before: {
      image: outside,
      imageSha256: digest(bytes),
      dom: { hash: "outside-dom" },
    },
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  await saveCheckpoint(root, checkpoint);

  const stdout = memoryStream();
  assert.equal(
    await runVerify([checkpoint.id, "--json"], {
      cwd: root,
      stdout,
      stderr: memoryStream(),
    }),
    2,
  );
  const result = JSON.parse(stdout.value());
  assert.equal(result.receipt.valid, true);
  assert.equal(result.reason, "artifact-invalid");
  assert.equal(result.artifacts[0].status, "invalid");
  assert.match(
    result.artifacts[0].detail,
    /direct file inside the checkpoint artifact directory/iu,
  );
});

test("verify refuses a symlinked artifact even when its target hash matches", async (context) => {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(
    root,
    config.currentSessionId,
    "po_verify_symlink_artifact",
  );
  const paths = storePaths(root);
  const artifactDirectory = join(paths.artifacts, checkpoint.id);
  await mkdir(artifactDirectory, { recursive: true });
  const outside = join(root, "outside-image.bin");
  const bytes = Buffer.from("matching outside artifact");
  await writeFile(outside, bytes);
  const link = join(artifactDirectory, "before.png");
  await symlink(outside, link);
  checkpoint.visual = {
    before: {
      image: `${paths.directoryName}/artifacts/${checkpoint.id}/before.png`,
      imageSha256: digest(bytes),
      dom: { hash: "symlink-dom" },
    },
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  await saveCheckpoint(root, checkpoint);

  const stdout = memoryStream();
  assert.equal(
    await runVerify([checkpoint.id, "--json"], {
      cwd: root,
      stdout,
      stderr: memoryStream(),
    }),
    2,
  );
  const result = JSON.parse(stdout.value());
  assert.equal(result.receipt.valid, true);
  assert.equal(result.reason, "artifact-invalid");
  assert.equal(result.artifacts[0].status, "invalid");
  assert.match(result.artifacts[0].detail, /must not be a symbolic link/iu);
});
