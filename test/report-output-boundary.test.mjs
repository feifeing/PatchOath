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
import { initializeStore, storePaths } from "../src/core/store.mjs";
import { generateReport } from "../src/report/generate.mjs";
import {
  assertReportCheckpointIds,
  prepareReportOutput,
} from "../src/report/output-boundary.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

async function assertMissing(path) {
  await assert.rejects(access(path), /ENOENT/u);
}

async function repository(context) {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function checkpointFixture(root, id = "po_report_output_fixture") {
  const head = git(root, ["rev-parse", "HEAD"]);
  return {
    schemaVersion: 2,
    id,
    sessionId: "session_report_output_fixture",
    status: "completed",
    createdAt: "2026-09-07T10:00:00.000Z",
    completedAt: "2026-09-07T10:01:00.000Z",
    prompt: { text: "Render a local report", source: "manual-cli" },
    authorization: null,
    repository: { head },
    before: { commit: head },
    after: { commit: head },
    analysis: {
      files: [],
      summary: {
        filesChanged: 0,
        linesChanged: 0,
        additions: 0,
        deletions: 0,
        modulesChanged: 0,
        directoriesChanged: 0,
        binaryFiles: 0,
      },
      contractCompliance: {
        declared: false,
        status: "not-declared",
        violations: [],
      },
      blastRadius: {
        score: 0,
        level: "contained",
        intentMismatch: { detected: false },
        authorizationDrift: false,
      },
      risk: {
        score: 0,
        level: "low",
        model: "patchoath-evidence-risk-v2",
        factors: [],
      },
      visual: null,
    },
    visual: null,
    receipt: null,
  };
}

test("report output is rebuilt from an empty checkpoint directory", async (context) => {
  const root = await repository(context);
  const id = "po_output_rebuild";
  const first = await prepareReportOutput(root, id);
  const stale = join(first.reportDirectory, "stale.txt");
  await writeFile(stale, "old derived output", "utf8");

  const second = await prepareReportOutput(root, id);

  assert.equal(second.reportDirectory, first.reportDirectory);
  await assertMissing(stale);
  assert.deepEqual(await readdir(second.reportDirectory), ["assets"]);
});

test("report root symlink escapes are rejected before any external write", async (context) => {
  const root = await repository(context);
  const outside = await mkdtemp(join(tmpdir(), "patchoath-report-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const store = join(root, ".patchoath");
  await mkdir(store);
  await symlink(outside, join(store, "reports"));

  await assert.rejects(
    prepareReportOutput(root, "po_output_escape"),
    /Report root directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("checkpoint report directory symlinks are rejected", async (context) => {
  const root = await repository(context);
  await initializeStore(root);
  const paths = storePaths(root);
  const outside = await mkdtemp(join(tmpdir(), "patchoath-checkpoint-report-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(paths.reports, "po_output_symlink"));

  await assert.rejects(
    prepareReportOutput(root, "po_output_symlink"),
    /Checkpoint report directory must not be a symbolic link/iu,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("report checkpoint identifiers are validated before path construction", () => {
  assert.throws(
    () => assertReportCheckpointIds([{ id: "../../outside" }]),
    /Invalid report checkpoint ID/iu,
  );
  assert.throws(
    () => assertReportCheckpointIds([{ id: "po_valid" }, { id: "po_bad/name" }]),
    /Invalid report checkpoint ID/iu,
  );
});

test("report regeneration removes nested destination symlinks without touching their targets", async (context) => {
  const root = await repository(context);
  await initializeStore(root);
  const paths = storePaths(root);
  const checkpoint = checkpointFixture(root);
  const reportDirectory = join(paths.reports, checkpoint.id);
  const protectedTarget = join(root, "protected-target.txt");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(protectedTarget, "keep-me", "utf8");
  await symlink(protectedTarget, join(reportDirectory, "index.html"));

  const report = await generateReport(root, [checkpoint], checkpoint.id);

  assert.equal(await readFile(protectedTarget, "utf8"), "keep-me");
  assert.equal((await lstat(report.index)).isSymbolicLink(), false);
  assert.match(await readFile(report.index, "utf8"), /PatchOath/iu);
});
