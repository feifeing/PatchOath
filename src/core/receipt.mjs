import { createHash } from "node:crypto";
import {
  EVIDENCE_RECEIPT_PREFIX,
  LEGACY_EVIDENCE_RECEIPT_PREFIX,
  hasLegacyPrefix,
} from "./brand.mjs";

const CURRENT_EVIDENCE_VERSION = 2;
const SUPPORTED_EVIDENCE_VERSIONS = new Set([1, 2]);

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

function normalizedFileManifest(files = []) {
  return files
    .map((file) => ({
      path: String(file.path || "").replaceAll("\\", "/"),
      oldPath: file.oldPath ? String(file.oldPath).replaceAll("\\", "/") : null,
      status: file.status || null,
      additions: Number.isFinite(file.additions) ? file.additions : null,
      deletions: Number.isFinite(file.deletions) ? file.deletions : null,
      binary: Boolean(file.binary),
      category: file.category || null,
      module: file.module || null,
      directory: file.directory || null,
      extension: file.extension || null,
      signals: Array.isArray(file.signals) ? [...file.signals].sort() : [],
    }))
    .sort((left, right) => {
      const pathOrder = left.path.localeCompare(right.path);
      if (pathOrder !== 0) return pathOrder;
      return String(left.oldPath || "").localeCompare(
        String(right.oldPath || ""),
      );
    });
}

function evidenceForCheckpointV1(checkpoint) {
  if (!checkpoint?.before?.commit || !checkpoint?.after?.commit) return null;
  return {
    version: 1,
    checkpointId: checkpoint.id,
    sessionId: checkpoint.sessionId,
    prompt: {
      sha256: sha256(checkpoint.prompt?.text || ""),
      source: checkpoint.prompt?.source || null,
    },
    authorization: checkpoint.authorization
      ? {
          sha256: sha256(checkpoint.authorization),
          contract: checkpoint.authorization,
        }
      : null,
    git: {
      headAtStart: checkpoint.repository?.head || null,
      beforeCommit: checkpoint.before.commit,
      afterCommit: checkpoint.after.commit,
    },
    effect: {
      summary: checkpoint.analysis?.summary || null,
      contractCompliance: checkpoint.analysis?.contractCompliance || null,
      blastRadius: checkpoint.analysis?.blastRadius || null,
      risk: checkpoint.analysis?.risk || null,
    },
    visual: checkpoint.visual
      ? {
          beforeImageSha256: checkpoint.visual.before?.imageSha256 || null,
          afterImageSha256: checkpoint.visual.after?.imageSha256 || null,
          beforeDomHash: checkpoint.visual.before?.dom?.hash || null,
          afterDomHash: checkpoint.visual.after?.dom?.hash || null,
        }
      : null,
  };
}

function evidenceForCheckpointV2(checkpoint) {
  const legacy = evidenceForCheckpointV1(checkpoint);
  if (!legacy) return null;
  const fileManifest = normalizedFileManifest(checkpoint.analysis?.files || []);
  return {
    ...legacy,
    version: 2,
    effect: {
      summary: checkpoint.analysis?.summary || null,
      fileManifest,
      fileManifestSha256: sha256(fileManifest),
      intent: checkpoint.analysis?.intent
        ? stable(checkpoint.analysis.intent)
        : null,
      contractCompliance: checkpoint.analysis?.contractCompliance || null,
      blastRadius: checkpoint.analysis?.blastRadius || null,
      risk: checkpoint.analysis?.risk || null,
      visualAnalysis: checkpoint.analysis?.visual
        ? stable(checkpoint.analysis.visual)
        : null,
    },
  };
}

function evidenceForCheckpoint(checkpoint, version) {
  if (version === 1) return evidenceForCheckpointV1(checkpoint);
  if (version === 2) return evidenceForCheckpointV2(checkpoint);
  throw new Error(`Unsupported Evidence Receipt version: ${version}.`);
}

function coverageForVersion(version) {
  if (version === 1) {
    return {
      evidenceVersion: 1,
      fileManifestBound: false,
      intentAnalysisBound: false,
      visualAnalysisBound: false,
      scope: "legacy-v1",
    };
  }
  if (version === 2) {
    return {
      evidenceVersion: 2,
      fileManifestBound: true,
      intentAnalysisBound: true,
      visualAnalysisBound: true,
      scope: "effect-manifest-v2",
    };
  }
  return null;
}

export function createEvidenceReceipt(
  checkpoint,
  { version = CURRENT_EVIDENCE_VERSION, legacyPrefix = false } = {},
) {
  if (!SUPPORTED_EVIDENCE_VERSIONS.has(version)) {
    throw new Error(`Unsupported Evidence Receipt version: ${version}.`);
  }
  const evidence = evidenceForCheckpoint(checkpoint, version);
  if (!evidence) return null;
  const prefix = legacyPrefix
    ? LEGACY_EVIDENCE_RECEIPT_PREFIX
    : EVIDENCE_RECEIPT_PREFIX;
  return {
    algorithm: "sha256",
    receiptId: `${prefix}_${sha256(evidence).slice(0, 24)}`,
    evidence,
  };
}

export function verifyEvidenceReceipt(checkpoint) {
  const stored = checkpoint?.receipt;
  if (!stored) {
    const recomputed = createEvidenceReceipt(checkpoint);
    return {
      valid: false,
      reason: "missing-receipt",
      expectedReceiptId: recomputed?.receiptId || null,
      actualReceiptId: null,
      coverage: recomputed
        ? coverageForVersion(recomputed.evidence.version)
        : null,
    };
  }

  const version = stored.evidence?.version;
  if (!SUPPORTED_EVIDENCE_VERSIONS.has(version)) {
    return {
      valid: false,
      reason: "unsupported-evidence-version",
      expectedReceiptId: null,
      actualReceiptId: stored.receiptId || null,
      coverage: null,
    };
  }

  const legacyPrefix = hasLegacyPrefix(
    stored.receiptId,
    LEGACY_EVIDENCE_RECEIPT_PREFIX,
  );
  const recomputed = createEvidenceReceipt(checkpoint, {
    version,
    legacyPrefix,
  });
  if (!recomputed) {
    return {
      valid: false,
      reason: "missing-receipt",
      expectedReceiptId: null,
      actualReceiptId: stored.receiptId || null,
      coverage: coverageForVersion(version),
    };
  }
  if (stored.algorithm !== "sha256") {
    return {
      valid: false,
      reason: "unsupported-algorithm",
      expectedReceiptId: recomputed.receiptId,
      actualReceiptId: stored.receiptId || null,
      coverage: coverageForVersion(version),
    };
  }
  const idMatches = stored.receiptId === recomputed.receiptId;
  const evidenceMatches =
    sha256(stored.evidence) === sha256(recomputed.evidence);
  return {
    valid: idMatches && evidenceMatches,
    reason: idMatches && evidenceMatches ? "verified" : "evidence-mismatch",
    expectedReceiptId: recomputed.receiptId,
    actualReceiptId: stored.receiptId || null,
    coverage: coverageForVersion(version),
  };
}

export const EVIDENCE_RECEIPT_VERSION = CURRENT_EVIDENCE_VERSION;
