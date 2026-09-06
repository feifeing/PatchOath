import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createEvidenceReceipt } from "../src/core/receipt.mjs";
import { createHistoricalEffectReview } from "../src/core/review-record.mjs";
import { saveHistoricalEffectReview } from "../src/core/review-store.mjs";
import { generateReport } from "../src/report/generate.mjs";
import { createRepository, git } from "../test-support/helpers.mjs";

function analysisFixture() {
  return {
    files: [],
    summary: {
      filesChanged: 2,
      linesChanged: 2,
      additions: 2,
      deletions: 0,
      modulesChanged: 2,
      directoriesChanged: 2,
      binaryFiles: 0,
    },
    contractCompliance: {
      declared: true,
      status: "violated",
      violations: [
        {
          id: "outside-authorized-scope",
          detail: "One file fell outside the declared allow scope.",
        },
      ],
    },
    blastRadius: {
      score: 34,
      level: "expanded",
      intentMismatch: { detected: false },
      authorizationDrift: true,
    },
    risk: {
      score: 19,
      level: "low",
      model: "patchoath-evidence-risk-v2",
      factors: [],
    },
    visual: null,
  };
}

async function checkpointFixture() {
  const root = await createRepository();
  const before = git(root, ["rev-parse", "HEAD"]);
  await mkdir(join(root, "src", "ui"), { recursive: true });
  await mkdir(join(root, "src", "shared"), { recursive: true });
  await writeFile(
    join(root, "src", "ui", "button.js"),
    "export const button = 1;\n",
    "utf8",
  );
  await writeFile(
    join(root, "src", "shared", "helper.js"),
    "export const helper = 1;\n",
    "utf8",
  );
  git(root, ["add", "src"]);
  git(root, ["commit", "-m", "observed review effect"]);
  const after = git(root, ["rev-parse", "HEAD"]);

  const checkpoint = {
    schemaVersion: 2,
    id: "po_report_review_fixture",
    sessionId: "session_report_review",
    status: "completed",
    createdAt: "2026-09-03T09:00:00.000Z",
    completedAt: "2026-09-03T09:01:00.000Z",
    prompt: {
      text: "Adjust the UI without exposing Project Nightjar",
      source: "manual-cli",
    },
    authorization: {
      version: 1,
      mode: "explicit-user-authorization",
      allow: ["src/ui/**"],
      deny: ["src/auth/**"],
      protectedSurfaces: ["auth"],
      maxFiles: 1,
      maxLines: 1,
      maxModules: 1,
    },
    repository: { head: before },
    before: { commit: before },
    after: { commit: after },
    analysis: analysisFixture(),
    visual: null,
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  return { root, checkpoint };
}

async function addHistoricalReview(root, checkpoint) {
  const record = createHistoricalEffectReview({
    checkpoint,
    disposition: "accept-effect",
    recordedAt: "2026-09-03T09:02:00.000Z",
    note: "Accepted for this captured effect only.",
    reviewerLabel: "Review Fixture",
  });
  await saveHistoricalEffectReview(root, record);
  return record;
}

function parseReportData(source) {
  const prefix = "window.__PATCHOATH_REPORT__ = ";
  assert.ok(source.startsWith(prefix));
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/u, ""));
}

test("generated reports derive review evidence and historical human outcomes", async () => {
  const { root, checkpoint } = await checkpointFixture();
  const historicalRecord = await addHistoricalReview(root, checkpoint);
  const report = await generateReport(root, [checkpoint], checkpoint.id);
  const source = await readFile(
    join(report.directory, "report-data.js"),
    "utf8",
  );
  const payload = parseReportData(source);
  const rendered = payload.checkpoints[0];

  assert.equal(rendered.review.sourceReceipt.valid, true);
  assert.equal(rendered.review.sourceReceipt.coverage.evidenceVersion, 2);
  assert.equal(rendered.review.sourceReceipt.coverage.fileManifestBound, true);
  assert.equal(
    rendered.review.sourceReceipt.coverage.scope,
    "effect-manifest-v2",
  );
  assert.equal(rendered.review.gitEffect.recomputed, true);
  assert.equal(rendered.review.gitEffect.files, 2);
  assert.equal(rendered.review.contractDelta.status, "proposal-ready");
  assert.deepEqual(rendered.review.contractDelta.delta.exactAllowAdditions, [
    {
      path: "src/shared/helper.js",
      representable: true,
      rationale: "exact-observed-path-only",
    },
  ]);
  assert.equal(rendered.review.contractDelta.delta.budgets.maxFiles.to, 2);
  assert.equal(rendered.review.contractDelta.delta.budgets.maxLines.to, 2);
  assert.equal(rendered.review.contractDelta.delta.budgets.maxModules.to, 2);
  assert.equal(
    rendered.review.contractDelta.counterfactual.status,
    "compliant",
  );
  assert.match(
    rendered.review.contractDelta.proposalReceipt.receiptId,
    /^pocd_[a-f0-9]{24}$/u,
  );

  const historical = rendered.review.historicalEffectReview;
  assert.equal(historical.status, "record-linked");
  assert.equal(historical.count, 1);
  assert.equal(historical.latest.record.recordId, historicalRecord.recordId);
  assert.match(historicalRecord.recordId, /^por_[a-f0-9]{24}$/u);
  assert.equal(historical.latest.record.disposition, "accept-effect");
  assert.equal(historical.latest.integrity.valid, true);
  assert.equal(historical.sourceReceiptCurrent.valid, true);
  assert.equal(historical.authorityBoundary.historicalEffectOnly, true);
  assert.equal(historical.authorityBoundary.changeContractMutated, false);
  assert.equal(historical.authorityBoundary.futureAuthorityGranted, false);
  assert.equal(
    historical.fullVerifyCommand,
    `patchoath review --verify ${historicalRecord.recordId}`,
  );

  assert.equal(rendered.review.disclosure.status, "verified");
  assert.equal(rendered.review.disclosure.mode, "minimum-disclosure");
  assert.ok(rendered.review.disclosure.omitted.includes("promptText"));
  assert.ok(rendered.review.disclosure.omitted.includes("filePaths"));
  assert.match(rendered.review.disclosure.receiptId, /^pod_[a-f0-9]{24}$/u);

  assert.match(source, /Project Nightjar/u);
  assert.match(source, /Review Fixture/u);
  const html = await readFile(report.index, "utf8");
  assert.match(html, /review\.css/u);
  assert.match(html, /review-ui\.js/u);
  assert.match(html, /historical-review\.css/u);
  assert.match(html, /historical-review-ui\.js/u);
  await readFile(join(report.directory, "review.css"), "utf8");
  await readFile(join(report.directory, "review-ui.js"), "utf8");
  await readFile(join(report.directory, "historical-review.css"), "utf8");
  await readFile(join(report.directory, "historical-review-ui.js"), "utf8");
});

test("report review plane invalidates a historical review when its source receipt is invalid", async () => {
  const { root, checkpoint } = await checkpointFixture();
  await addHistoricalReview(root, checkpoint);
  checkpoint.prompt.text = "tampered prompt";

  const report = await generateReport(root, [checkpoint], checkpoint.id);
  const payload = parseReportData(
    await readFile(join(report.directory, "report-data.js"), "utf8"),
  );
  const review = payload.checkpoints[0].review;

  assert.equal(review.sourceReceipt.valid, false);
  assert.equal(review.contractDelta.status, "unavailable");
  assert.equal(review.contractDelta.reason, "source-receipt-unverified");
  assert.equal(review.disclosure.status, "unavailable");
  assert.equal(review.disclosure.reason, "source-receipt-unverified");
  assert.equal(review.gitEffect.recomputed, false);
  assert.equal(review.historicalEffectReview.status, "invalid");
  assert.equal(review.historicalEffectReview.sourceReceiptCurrent.valid, false);
});
