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

function parseReportData(source) {
  const prefix = "window.__PATCHOATH_REPORT__ = ";
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/u, ""));
}

test("generated report assets keep before and after captures with matching basenames distinct", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const before = join(paths.artifacts, "before", "same.png");
  const after = join(paths.artifacts, "after", "same.png");
  await mkdir(join(paths.artifacts, "before"));
  await mkdir(join(paths.artifacts, "after"));
  await writeFile(before, "before-bytes");
  await writeFile(after, "after-bytes");
  const checkpoint = {
    id: "po_collision_fixture",
    visual: { before: { image: before }, after: { image: after } },
    analysis: { visual: { pixel: { diffImage: { invalid: true } } } },
    receipt: null,
  };
  const report = await generateReport(root, [checkpoint], checkpoint.id);
  const payload = parseReportData(
    await readFile(join(report.directory, "report-data.js"), "utf8"),
  );
  const rendered = payload.checkpoints[0];
  assert.notEqual(rendered.visual.before.image, rendered.visual.after.image);
  assert.equal(
    await readFile(
      join(report.directory, rendered.visual.before.image),
      "utf8",
    ),
    "before-bytes",
  );
  assert.equal(
    await readFile(join(report.directory, rendered.visual.after.image), "utf8"),
    "after-bytes",
  );
  assert.equal(rendered.analysis.visual.pixel.diffImage, null);
  assert.equal(payload.assetIngestion.accepted, 2);
  assert.equal(payload.assetIngestion.blocked, 1);
});

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

test("report assets reject invalid source values and directory sources", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const destination = join(paths.reports, "asset-test", "before.png");
  const audit = createReportAssetAudit();
  for (const source of [42, { path: "secret.png" }, ""]) {
    const result = await copyReportEvidenceAsset(
      root,
      source,
      destination,
      audit,
    );
    assert.equal(result.reason, "invalid-source-path");
  }
  const result = await copyReportEvidenceAsset(
    root,
    paths.artifacts,
    destination,
    audit,
  );
  assert.equal(result.reason, "non-file-source");
  assert.equal(audit.blocked, 4);
  await assertMissing(destination);
});

test("report asset sources cannot escape through the artifacts root", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const outside = await createRepository();
  context.after(() => rm(outside, { recursive: true, force: true }));
  await rm(paths.artifacts, { recursive: true });
  await symlink(
    outside,
    paths.artifacts,
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(join(outside, "before.png"), "outside-secret", "utf8");
  const destination = join(paths.reports, "asset-test", "before.png");
  const result = await copyReportEvidenceAsset(
    root,
    join(paths.artifacts, "before.png"),
    destination,
  );
  assert.equal(result.reason, "artifacts-root-escape");
  await assertMissing(destination);
});

test("report asset ingestion does not overwrite existing destination symlinks", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const source = join(paths.artifacts, "before.png");
  const protectedTarget = join(root, "protected-target.txt");
  const destination = join(paths.reports, "before.png");
  await writeFile(source, "image-bytes", "utf8");
  await writeFile(protectedTarget, "keep-me", "utf8");
  try {
    await symlink(protectedTarget, destination);
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      context.skip(
        "Windows file symlink privilege is unavailable; directory junction escapes are tested separately.",
      );
      return;
    }
    throw error;
  }
  await assert.rejects(
    copyReportEvidenceAsset(root, source, destination),
    /EEXIST/u,
  );
  assert.equal(await readFile(protectedTarget, "utf8"), "keep-me");
});

test("report assets reject symlink escapes from inside the artifacts root", async (context) => {
  const root = await repository(context);
  const paths = storePaths(root);
  const directory = join(paths.artifacts, "po_symlink_fixture");
  const secret = join(root, "outside-secret.txt");
  const linkedDirectory = join(directory, "outside");
  const linked = join(linkedDirectory, "outside-secret.txt");
  const destination = join(paths.reports, "asset-test", "before.png");
  await mkdir(directory, { recursive: true });
  await writeFile(secret, "outside-secret", "utf8");
  await symlink(
    root,
    linkedDirectory,
    process.platform === "win32" ? "junction" : "dir",
  );

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
    visual: {
      adapter: "playwright",
      before: { image: secret, imageSha256: "tampered" },
    },
    receipt: null,
  };

  const report = await generateReport(root, [checkpoint], checkpoint.id);
  const source = await readFile(
    join(report.directory, "report-data.js"),
    "utf8",
  );
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
