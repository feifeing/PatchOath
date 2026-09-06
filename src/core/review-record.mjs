import { createHash } from "node:crypto";
import {
  LEGACY_REVIEW_RECORD_PREFIX,
  REVIEW_RECORD_PREFIX,
  hasLegacyPrefix,
} from "./brand.mjs";

const REVIEW_RECORD_VERSION = 1;
const DISPOSITIONS = new Set([
  "accept-effect",
  "reject-effect",
  "needs-follow-up",
]);
const REVIEW_KINDS = new Set([
  "patchoath-historical-effect-review",
  "vibetrace-historical-effect-review",
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function reviewRecordId(body, legacyPrefix = false) {
  const prefix = legacyPrefix
    ? LEGACY_REVIEW_RECORD_PREFIX
    : REVIEW_RECORD_PREFIX;
  return `${prefix}_${sha256(body).slice(0, 24)}`;
}

export function createHistoricalEffectReview({
  checkpoint,
  disposition,
  recordedAt = new Date().toISOString(),
  note = null,
  reviewerLabel = null,
}) {
  if (!checkpoint?.receipt?.receiptId) {
    throw new Error(
      "A completed checkpoint with an Evidence Receipt is required.",
    );
  }
  if (!DISPOSITIONS.has(disposition)) {
    throw new Error(`Unsupported review disposition: ${disposition}.`);
  }

  const body = {
    version: REVIEW_RECORD_VERSION,
    kind: "patchoath-historical-effect-review",
    checkpointId: checkpoint.id,
    sourceReceiptId: checkpoint.receipt.receiptId,
    sourceEvidenceVersion: checkpoint.receipt.evidence?.version || null,
    disposition,
    recordedAt,
    note: note?.trim() || null,
    reviewerLabel: reviewerLabel?.trim() || null,
    authorityEffect: {
      scope: "historical-effect-only",
      mutatesChangeContract: false,
      grantsFutureAuthority: false,
      changesProtectedSurfaces: false,
    },
  };

  return {
    ...body,
    recordId: reviewRecordId(body),
  };
}

export function verifyHistoricalEffectReview(record, checkpoint) {
  if (!record || record.version !== REVIEW_RECORD_VERSION) {
    return { valid: false, reason: "unsupported-review-version" };
  }
  if (!REVIEW_KINDS.has(record.kind)) {
    return { valid: false, reason: "unexpected-review-kind" };
  }
  if (!DISPOSITIONS.has(record.disposition)) {
    return { valid: false, reason: "invalid-disposition" };
  }

  const { recordId, ...body } = record;
  const expectedRecordId = reviewRecordId(
    body,
    hasLegacyPrefix(recordId, LEGACY_REVIEW_RECORD_PREFIX),
  );
  if (recordId !== expectedRecordId) {
    return {
      valid: false,
      reason: "review-record-mismatch",
      expectedRecordId,
      actualRecordId: recordId || null,
    };
  }

  if (!checkpoint || checkpoint.id !== record.checkpointId) {
    return {
      valid: false,
      reason: "checkpoint-mismatch",
      expectedRecordId,
      actualRecordId: recordId,
    };
  }
  if (checkpoint.receipt?.receiptId !== record.sourceReceiptId) {
    return {
      valid: false,
      reason: "source-receipt-mismatch",
      expectedRecordId,
      actualRecordId: recordId,
    };
  }
  if (
    (checkpoint.receipt?.evidence?.version || null) !==
    record.sourceEvidenceVersion
  ) {
    return {
      valid: false,
      reason: "source-evidence-version-mismatch",
      expectedRecordId,
      actualRecordId: recordId,
    };
  }
  if (
    record.authorityEffect?.scope !== "historical-effect-only" ||
    record.authorityEffect?.mutatesChangeContract !== false ||
    record.authorityEffect?.grantsFutureAuthority !== false ||
    record.authorityEffect?.changesProtectedSurfaces !== false
  ) {
    return {
      valid: false,
      reason: "authority-boundary-mismatch",
      expectedRecordId,
      actualRecordId: recordId,
    };
  }

  return {
    valid: true,
    reason: "verified",
    expectedRecordId,
    actualRecordId: recordId,
  };
}

export { REVIEW_RECORD_VERSION };
