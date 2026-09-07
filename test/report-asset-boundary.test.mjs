import assert from "node:assert/strict";
import {
  access,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { initializeStore, storePaths } from "../src/core/store.mjs";
import {
  copyReportEvidenceAsset,
  createReportAssetAudit,
} from "../src/report/asset-boundary.mjs";
import { generateReport } from "../src/report/generate.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

async function assertMissing(path) {
  await assert.rejects(access(path), /ENOENT/u);
}

async function repository(context) {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  await initializeStore(root);
  return root;
}

test("report assets accept regular files inside the selected evidence artifacts root", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const source = join(paths.artifacts, "po_asset_fixture", "before.png");
  const destination = join(paths.reports, "asset-test", "before.png");
  await mkdir(join(paths.artifacts, "po_asset_fixture"), { recursive: true });
  await writeFile(source, "trusted-image-bytes", "utf8");

  const audit = createReportAssetAudit();
  const result = await copyReportEvidenceAsset(
    root,
    source,
    destination,
    audit,
  );

  assert.equal(result.copied, true);
  assert.equal(result.status, "accepted");
  assert.equal(await readFile(destination, "utf8"), "trusted-image-bytes");
  assert.deepEqual(audit, {
    policy: "evidence-store-artifacts-only",
    accepted: 1,
    missing: 0,
    blocked: 0,
    sourcePathsDisclosed: false,
    reasons: {},
  });
});

test("report assets reject repository files outside the artifacts root", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const source = join(root, "private-local.txt");
  const destination = join(paths.reports, "asset-test", "copied.txt");
  await writeFile(source, "must-not-be-disclosed", "utf8");

  const audit = createReportAssetAudit();
  const result = await copyReportEvidenceAsset(
    root,
    source,
    destination,
    audit,
  );

  assert.equal(result.copied, false);
  assert.equal(result.reason, "outside-artifacts-root");
  assert.equal(audit.blocked, 1);
  assert.equal(audit.reasons["outside-artifacts-root"], 1);
  await assertMissing(destination);
});

test("report assets reject symlink escapes from inside the artifacts root", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const directory = join(paths.artifacts, "po_symlink_fixture");
  const secret = join(root, "outside-secret.txt");
  const linked = join(directory, "before.png");
  const destination = join(paths.reports, "asset-test", "before.png");
  await mkdir(directory, { recursive: true });
  await writeFile(secret, "outside-secret", "utf8");
  await symlink(secret, linked);

  const audit = createReportAssetAudit();
  const result = await copyReportEvidenceAsset(
    root,
    linked,
    destination,
    audit,
  );

  assert.equal(result.copied, false);
  assert.equal(result.reason, "symlink-escape");
  assert.equal(audit.blocked, 1);
  assert.equal(audit.reasons["symlink-escape"], 1);
  await assertMissing(destination);
});

test("generated reports null rejected visual assets without disclosing their source paths", async (context) => {
  const root = await repository(context);
  const head = git(root, ["rev-parse", "HEAD"]);
  const secret = join(root, "private-local.txt");
  await writeFile(secret, "must-not-enter-report", "utf8");

  const checkpoint = {
    schemaVersion: 2,
    id: "po_report_asset_boundary",
    sessionId: "session_report_asset_boundary",
    status: "completed",
    createdAt: "2026-09-07T10:00:00.000Z",
    completedAt: "2026-09-07T10:01:00.000Z",
    prompt: { text: "Capture visual evidence", source: "manual-cli" },
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
      contractCompliance: { declared: false, status: "not-declared", violations: [] },
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
    visual: {
      adapter: "playwright",
      before: { image: secret, imageSha256: "tampered" },
    },
    receipt: null,
  };

  const report = await generateReport(root, [checkpoint], checkpoint.id);
  const source = await readFile(join(report.directory, "report-data.js"), "utf8");
  const prefix = "window.__PATCHOATH_REPORT__ = ";
  const payload = JSON.parse(source.slice(prefix.length).replace(/;\s*$/u, ""));

  assert.equal(payload.assetIngestion.accepted, 0);
  assert.equal(payload.assetIngestion.blocked, 1);
  assert.equal(payload.assetIngestion.sourcePathsDisclosed, false);
  assert.equal(payload.assetIngestion.reasons["outside-artifacts-root"], 1);
  assert.equal(payload.checkpoints[0].visual.before.image, null);
  assert.doesNotMatch(source, /private-local\.txt/u);
  assert.doesNotMatch(source, /must-not-enter-report/u);
  await assertMissing(
    join(report.directory, "assets", `${checkpoint.id}-private-local.txt`),
  );
});
