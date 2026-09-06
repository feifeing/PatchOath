import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { computeObservedContractDelta } from "../core/contract-delta.mjs";
import {
  createDisclosureCapsule,
  verifyDisclosureCapsule,
} from "../core/disclosure.mjs";
import { verifyEvidenceReceipt } from "../core/receipt.mjs";
import { verifyHistoricalEffectReview } from "../core/review-record.mjs";
import { listHistoricalEffectReviews } from "../core/review-store.mjs";
import { storePaths } from "../core/store.mjs";
import { collectCommitDiff } from "../git/diff.mjs";

const sourceWebDirectory = fileURLToPath(
  new URL("../../web/", import.meta.url),
);

async function copyIfPresent(source, destination) {
  try {
    await access(source);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    return true;
  } catch {
    return false;
  }
}

function unavailable(reason, detail = null) {
  return { status: "unavailable", reason, detail };
}

function buildHistoricalReview(checkpoint, records, sourceVerification) {
  const relevant = records
    .filter((record) => record.checkpointId === checkpoint.id)
    .map((record) => ({
      record,
      integrity: verifyHistoricalEffectReview(record, checkpoint),
    }));
  const latest = relevant[0] || null;

  if (!latest) {
    return {
      status: "not-recorded",
      count: 0,
      latest: null,
      sourceReceiptCurrent: {
        valid: sourceVerification.valid,
        reason: sourceVerification.reason,
      },
      reportVerificationScope: "no-review-record",
      authorityBoundary: {
        historicalEffectOnly: true,
        changeContractMutated: false,
        futureAuthorityGranted: false,
      },
    };
  }

  const linked = latest.integrity.valid && sourceVerification.valid;
  return {
    status: linked ? "record-linked" : "invalid",
    count: relevant.length,
    latest,
    records: relevant,
    sourceReceiptCurrent: {
      valid: sourceVerification.valid,
      reason: sourceVerification.reason,
    },
    reportVerificationScope: "record-integrity-plus-source-receipt",
    fullVerifyCommand: `patchoath review --verify ${latest.record.recordId}`,
    authorityBoundary: {
      historicalEffectOnly: true,
      changeContractMutated: false,
      futureAuthorityGranted: false,
    },
  };
}

function buildReviewEvidence(root, checkpoint, historicalRecords) {
  const sourceVerification = verifyEvidenceReceipt(checkpoint);
  const review = {
    sourceReceipt: {
      valid: sourceVerification.valid,
      reason: sourceVerification.reason,
      receiptId: checkpoint.receipt?.receiptId || null,
      coverage: sourceVerification.coverage || null,
    },
    gitEffect: {
      recomputed: false,
      source: null,
    },
    contractDelta: null,
    historicalEffectReview: buildHistoricalReview(
      checkpoint,
      historicalRecords,
      sourceVerification,
    ),
    disclosure: null,
  };

  if (!sourceVerification.valid) {
    review.contractDelta = unavailable("source-receipt-unverified");
    review.disclosure = unavailable("source-receipt-unverified");
    return review;
  }

  let observedFiles;
  try {
    observedFiles = collectCommitDiff(
      root,
      checkpoint.before?.commit,
      checkpoint.after?.commit,
    );
    review.gitEffect = {
      recomputed: true,
      source: "recomputed-before-after-git-diff",
      files: observedFiles.length,
    };
  } catch (error) {
    review.contractDelta = unavailable(
      "git-effect-recompute-failed",
      error.message,
    );
  }

  if (observedFiles) {
    try {
      review.contractDelta = computeObservedContractDelta(
        checkpoint,
        observedFiles,
      );
    } catch (error) {
      review.contractDelta = unavailable(
        "contract-delta-failed",
        error.message,
      );
    }
  }

  try {
    const capsule = createDisclosureCapsule(checkpoint);
    const verification = verifyDisclosureCapsule(capsule);
    review.disclosure = {
      status: verification.valid ? "verified" : "invalid",
      reason: verification.reason,
      mode: capsule.disclosure.policy.mode,
      omitted: capsule.disclosure.omitted,
      policy: capsule.disclosure.policy,
      receiptId: capsule.disclosureReceipt.receiptId,
      sourceEvidenceReceiptId:
        capsule.disclosureReceipt.sourceEvidenceReceiptId,
    };
  } catch (error) {
    review.disclosure = unavailable("capsule-preview-failed", error.message);
  }

  return review;
}

function portableCheckpoint(root, checkpoint, assetMap, historicalRecords) {
  const copy = structuredClone(checkpoint);
  if (copy.visual?.before?.image)
    copy.visual.before.image = assetMap.get(copy.visual.before.image) || null;
  if (copy.visual?.after?.image)
    copy.visual.after.image = assetMap.get(copy.visual.after.image) || null;
  if (copy.analysis?.visual?.pixel?.diffImage) {
    copy.analysis.visual.pixel.diffImage =
      assetMap.get(copy.analysis.visual.pixel.diffImage) || null;
  }
  if (copy.before) delete copy.before.ref;
  if (copy.after) delete copy.after.ref;
  copy.review = buildReviewEvidence(root, checkpoint, historicalRecords);
  return copy;
}

export async function generateReport(root, checkpoints, selectedId) {
  const selected =
    checkpoints.find((checkpoint) => checkpoint.id === selectedId) ||
    checkpoints[0];
  if (!selected)
    throw new Error("There are no completed checkpoints to report.");
  const reportDirectory = join(storePaths(root).reports, selected.id);
  const assetDirectory = join(reportDirectory, "assets");
  await mkdir(assetDirectory, { recursive: true });

  for (const name of [
    "index.html",
    "styles.css",
    "brand.css",
    "contract.css",
    "review.css",
    "historical-review.css",
    "app.js",
    "contract-ui.js",
    "review-ui.js",
    "historical-review-ui.js",
  ]) {
    await copyFile(join(sourceWebDirectory, name), join(reportDirectory, name));
  }

  const assetMap = new Map();
  for (const checkpoint of checkpoints) {
    const sources = [
      checkpoint.visual?.before?.image,
      checkpoint.visual?.after?.image,
      checkpoint.analysis?.visual?.pixel?.diffImage,
    ].filter(Boolean);
    for (const source of sources) {
      const destinationName = `${checkpoint.id}-${basename(source)}`;
      const destination = join(assetDirectory, destinationName);
      const sourcePath = isAbsolute(source) ? source : join(root, source);
      if (await copyIfPresent(sourcePath, destination))
        assetMap.set(source, `./assets/${destinationName}`);
    }
  }

  const historicalRecords = await listHistoricalEffectReviews(root);
  const payload = {
    product: "PatchOath",
    mode: "report",
    selectedId: selected.id,
    generatedAt: new Date().toISOString(),
    checkpoints: checkpoints.map((checkpoint) =>
      portableCheckpoint(root, checkpoint, assetMap, historicalRecords),
    ),
  };
  await writeFile(
    join(reportDirectory, "report-data.js"),
    `window.__PATCHOATH_REPORT__ = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8",
  );

  let html = await readFile(join(reportDirectory, "index.html"), "utf8");
  html = html.replace(
    '<script type="module" src="./app.js"></script>',
    '<script src="./report-data.js"></script>\n    <script type="module" src="./app.js"></script>',
  );
  await writeFile(join(reportDirectory, "index.html"), html, "utf8");

  return {
    directory: reportDirectory,
    index: join(reportDirectory, "index.html"),
    relativeIndex: relative(root, join(reportDirectory, "index.html")),
  };
}
