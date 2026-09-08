import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { runDoctor } from "../src/doctor.mjs";
import {
  appendCheckpointToSession,
  initializeStore,
  loadCheckpoint,
  saveCheckpoint,
  saveState,
  storePaths,
} from "../src/core/store.mjs";
import { createRepository, git, memoryStream } from "../test-support/helpers.mjs";

const cli = fileURLToPath(new URL("../bin/patchoath.mjs", import.meta.url));

function recordingCheckpoint(root, sessionId, id = "po_doctor_recording") {
  const head = git(root, ["rev-parse", "HEAD"]);
  const ref = `refs/patchoath/checkpoints/${id}/before`;
  git(root, ["update-ref", ref, head]);
  return {
    schemaVersion: 2,
    id,
    sessionId,
    status: "recording",
    createdAt: "2026-09-08T00:00:00.000Z",
    completedAt: null,
    prompt: { text: "Audit this patch", source: "manual-cli" },
    authorization: null,
    repository: { head },
    before: { commit: head, ref },
  };
}

function completedCheckpoint(root, sessionId, id = "po_doctor_completed") {
  const head = git(root, ["rev-parse", "HEAD"]);
  const checkpoint = {
    schemaVersion: 2,
    id,
    sessionId,
    status: "completed",
    createdAt: "2026-09-08T00:00:00.000Z",
    completedAt: "2026-09-08T00:01:00.000Z",
    prompt: { text: "Audit this completed patch", source: "manual-cli" },
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
  return checkpoint;
}

async function doctorJson(root) {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const exitCode = await runDoctor(["--json"], { cwd: root, stdout, stderr });
  return {
    exitCode,
    stderr: stderr.value(),
    result: JSON.parse(stdout.value()),
  };
}

function check(result, id) {
  return result.checks.find((candidate) => candidate.id === id);
}

test("doctor is read-only before PatchOath initialization", async () => {
  const root = await createRepository();
  try {
    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 0);
    assert.equal(result.healthy, true);
    assert.equal(check(result, "store.integrity").status, "warn");
    await assert.rejects(access(join(root, ".patchoath")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports a healthy initialized trust graph", async () => {
  const root = await createRepository();
  try {
    const { config } = await initializeStore(root);
    const checkpoint = recordingCheckpoint(root, config.currentSessionId);
    await saveCheckpoint(root, checkpoint);
    await appendCheckpointToSession(root, config.currentSessionId, checkpoint.id);
    await saveState(root, {
      schemaVersion: 1,
      activeCheckpointId: checkpoint.id,
    });

    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 0);
    assert.equal(result.healthy, true);
    assert.equal(result.summary.fail, 0);
    assert.equal(check(result, "trust.graph").status, "pass");
    assert.equal(check(result, "git.snapshots").status, "pass");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("managed checkpoint storage binds filename identity to JSON identity", async () => {
  const root = await createRepository();
  try {
    const { config } = await initializeStore(root);
    const checkpoint = recordingCheckpoint(root, config.currentSessionId);
    const paths = storePaths(root);
    await writeFile(
      join(paths.checkpoints, "po_doctor_alias.json"),
      `${JSON.stringify(checkpoint, null, 2)}\n`,
      "utf8",
    );

    await assert.rejects(
      loadCheckpoint(root, "po_doctor_alias"),
      /storage identity mismatch/iu,
    );
    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 2);
    assert.equal(check(result, "checkpoints.storage").status, "fail");
    assert.match(
      check(result, "checkpoints.storage").details[0],
      /storage identity mismatch/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor detects an active checkpoint that does not exist", async () => {
  const root = await createRepository();
  try {
    await initializeStore(root);
    await saveState(root, {
      schemaVersion: 1,
      activeCheckpointId: "po_doctor_missing",
    });

    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 2);
    assert.equal(check(result, "trust.graph").status, "fail");
    assert.ok(
      check(result, "trust.graph").details.some((detail) =>
        detail.includes("active checkpoint po_doctor_missing is missing"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor detects a modern checkpoint missing from its session index", async () => {
  const root = await createRepository();
  try {
    const { config } = await initializeStore(root);
    const checkpoint = recordingCheckpoint(
      root,
      config.currentSessionId,
      "po_doctor_orphan",
    );
    await saveCheckpoint(root, checkpoint);

    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 2);
    assert.equal(check(result, "trust.graph").status, "fail");
    assert.ok(
      check(result, "trust.graph").details.some((detail) =>
        detail.includes("is not indexed by session"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor recomputes completed Evidence Receipts instead of trusting stored IDs", async () => {
  const root = await createRepository();
  try {
    const { config } = await initializeStore(root);
    const checkpoint = completedCheckpoint(root, config.currentSessionId);
    await saveCheckpoint(root, checkpoint);
    await appendCheckpointToSession(root, config.currentSessionId, checkpoint.id);

    const paths = storePaths(root);
    const checkpointPath = join(paths.checkpoints, `${checkpoint.id}.json`);
    const stored = JSON.parse(await readFile(checkpointPath, "utf8"));
    stored.analysis.summary.linesChanged = 1;
    await writeFile(
      checkpointPath,
      `${JSON.stringify(stored, null, 2)}\n`,
      "utf8",
    );

    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 2);
    assert.equal(check(result, "receipts.integrity").status, "fail");
    assert.match(
      check(result, "receipts.integrity").details[0],
      /evidence-mismatch/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor detects missing Git refs even when checkpoint JSON remains intact", async () => {
  const root = await createRepository();
  try {
    const { config } = await initializeStore(root);
    const checkpoint = recordingCheckpoint(
      root,
      config.currentSessionId,
      "po_doctor_missing_ref",
    );
    await saveCheckpoint(root, checkpoint);
    await appendCheckpointToSession(root, config.currentSessionId, checkpoint.id);
    git(root, ["update-ref", "-d", checkpoint.before.ref]);

    const { exitCode, result } = await doctorJson(root);
    assert.equal(exitCode, 2);
    assert.equal(check(result, "git.snapshots").status, "fail");
    assert.ok(
      check(result, "git.snapshots").details.some((detail) =>
        detail.includes("no PatchOath compatibility ref exists"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the top-level CLI dispatches doctor as a read-only command", async () => {
  const root = await createRepository();
  try {
    const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.store.exists, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
