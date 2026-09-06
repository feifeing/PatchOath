import { createHash } from "node:crypto";
import {
  DISCLOSURE_RECEIPT_PREFIX,
  LEGACY_DISCLOSURE_RECEIPT_PREFIX,
  hasLegacyPrefix,
} from "./brand.mjs";

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

export function createDisclosurePolicy({
  includePrompt = false,
  includePaths = false,
  includeContract = false,
} = {}) {
  return {
    version: 1,
    mode: "minimum-disclosure",
    fields: {
      promptText: Boolean(includePrompt),
      filePaths: Boolean(includePaths),
      contractPatterns: Boolean(includeContract),
      visualArtifactBytes: false,
      gitPatch: false,
    },
  };
}

function authorizationProjection(checkpoint, policy) {
  const contract = checkpoint.authorization;
  const evidence = checkpoint.receipt?.evidence?.authorization;
  if (!contract) return { declared: false, sha256: null };

  const projection = {
    declared: true,
    sha256: evidence?.sha256 || null,
    summary: {
      allowRuleCount: Array.isArray(contract.allow) ? contract.allow.length : 0,
      denyRuleCount: Array.isArray(contract.deny) ? contract.deny.length : 0,
      protectedSurfaceCount: Array.isArray(contract.protectedSurfaces)
        ? contract.protectedSurfaces.length
        : 0,
      maxFiles: contract.maxFiles ?? null,
      maxLines: contract.maxLines ?? null,
      maxModules: contract.maxModules ?? null,
    },
  };

  if (policy.fields.contractPatterns) {
    projection.contract = structuredClone(contract);
  }
  return projection;
}

function complianceProjection(compliance) {
  if (!compliance) return null;
  return {
    declared: Boolean(compliance.declared),
    status: compliance.status || null,
    violationIds: Array.isArray(compliance.violations)
      ? compliance.violations.map((violation) => violation.id).filter(Boolean)
      : [],
  };
}

function riskProjection(risk) {
  if (!risk) return null;
  return {
    score: risk.score ?? null,
    level: risk.level ?? null,
    model: risk.model || null,
    factors: Array.isArray(risk.factors)
      ? risk.factors.map((factor) => ({
          id: factor.id,
          points: factor.points,
        }))
      : [],
  };
}

function fileProjection(files) {
  return files.map((file) => ({
    path: file.path,
    oldPath: file.oldPath || null,
    status: file.status,
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    binary: Boolean(file.binary),
  }));
}

function evidenceProjection(checkpoint, policy) {
  const prompt = {
    sha256: checkpoint.receipt?.evidence?.prompt?.sha256 || null,
  };
  if (policy.fields.promptText) prompt.text = checkpoint.prompt?.text || "";

  const analysis = checkpoint.analysis || {};
  const blast = analysis.blastRadius || {};
  const evidence = {
    prompt,
    authorization: authorizationProjection(checkpoint, policy),
    effect: {
      summary: structuredClone(analysis.summary || null),
      contractCompliance: complianceProjection(analysis.contractCompliance),
      blastRadius: {
        score: blast.score ?? null,
        level: blast.level ?? null,
        intentMismatchDetected: Boolean(blast.intentMismatch?.detected),
        authorizationDrift: Boolean(blast.authorizationDrift),
      },
      risk: riskProjection(analysis.risk),
    },
    visual: checkpoint.visual
      ? {
          captured: true,
          beforeImageSha256: checkpoint.visual.before?.imageSha256 || null,
          afterImageSha256: checkpoint.visual.after?.imageSha256 || null,
          beforeDomHash: checkpoint.visual.before?.dom?.hash || null,
          afterDomHash: checkpoint.visual.after?.dom?.hash || null,
        }
      : { captured: false },
  };

  if (policy.fields.filePaths) {
    evidence.files = fileProjection(analysis.files || []);
  }
  return evidence;
}

function omittedFields(policy) {
  const omitted = ["gitPatch", "visualArtifactBytes"];
  if (!policy.fields.promptText) omitted.push("promptText");
  if (!policy.fields.filePaths) omitted.push("filePaths");
  if (!policy.fields.contractPatterns) omitted.push("contractPatterns");
  return omitted.sort();
}

function disclosureReceiptId({
  sourceEvidenceReceiptId,
  policySha256,
  projectionSha256,
  legacyPrefix = false,
}) {
  const prefix = legacyPrefix
    ? LEGACY_DISCLOSURE_RECEIPT_PREFIX
    : DISCLOSURE_RECEIPT_PREFIX;
  return `${prefix}_${sha256({
    sourceEvidenceReceiptId,
    policySha256,
    projectionSha256,
  }).slice(0, 24)}`;
}

export function createDisclosureCapsule(
  checkpoint,
  policy = createDisclosurePolicy(),
) {
  if (checkpoint?.status !== "completed" || !checkpoint?.receipt?.receiptId) {
    throw new Error(
      "A completed checkpoint with an Evidence Receipt is required.",
    );
  }

  const body = {
    schemaVersion: 1,
    kind: "patchoath-disclosure-capsule",
    source: {
      checkpointId: checkpoint.id,
      evidenceReceiptId: checkpoint.receipt.receiptId,
      completedAt: checkpoint.completedAt || null,
    },
    disclosure: {
      policy,
      omitted: omittedFields(policy),
    },
    evidence: evidenceProjection(checkpoint, policy),
  };
  const policySha256 = sha256(policy);
  const projectionSha256 = sha256(body.evidence);
  const receiptId = disclosureReceiptId({
    sourceEvidenceReceiptId: body.source.evidenceReceiptId,
    policySha256,
    projectionSha256,
  });

  return {
    ...body,
    disclosureReceipt: {
      algorithm: "sha256",
      receiptId,
      sourceEvidenceReceiptId: body.source.evidenceReceiptId,
      policySha256,
      projectionSha256,
    },
  };
}

export function auditDisclosureCapsule(capsule) {
  const policy = capsule?.disclosure?.policy;
  const evidence = capsule?.evidence;
  const violations = [];
  if (!policy || policy.version !== 1 || !policy.fields || !evidence) {
    return {
      valid: false,
      disclosureDrift: true,
      violations: ["invalid-disclosure-policy"],
    };
  }

  if (!policy.fields.promptText && "text" in (evidence.prompt || {})) {
    violations.push("prompt-text-disclosed");
  }
  if (!policy.fields.filePaths && "files" in evidence) {
    violations.push("file-paths-disclosed");
  }
  if (
    !policy.fields.contractPatterns &&
    "contract" in (evidence.authorization || {})
  ) {
    violations.push("contract-patterns-disclosed");
  }
  if ("patch" in evidence || "gitPatch" in evidence) {
    violations.push("git-patch-disclosed");
  }
  if (
    evidence.visual &&
    ("beforeImage" in evidence.visual || "afterImage" in evidence.visual)
  ) {
    violations.push("visual-artifact-bytes-disclosed");
  }

  return {
    valid: violations.length === 0,
    disclosureDrift: violations.length > 0,
    violations,
  };
}

export function verifyDisclosureCapsule(capsule) {
  const audit = auditDisclosureCapsule(capsule);
  const receipt = capsule?.disclosureReceipt;
  if (!receipt || receipt.algorithm !== "sha256") {
    return {
      valid: false,
      reason: "missing-or-unsupported-disclosure-receipt",
      audit,
    };
  }

  const policySha256 = sha256(capsule.disclosure.policy);
  const projectionSha256 = sha256(capsule.evidence);
  const expectedReceiptId = disclosureReceiptId({
    sourceEvidenceReceiptId: capsule.source?.evidenceReceiptId || null,
    policySha256,
    projectionSha256,
    legacyPrefix: hasLegacyPrefix(
      receipt.receiptId,
      LEGACY_DISCLOSURE_RECEIPT_PREFIX,
    ),
  });
  const receiptMatches =
    receipt.receiptId === expectedReceiptId &&
    receipt.sourceEvidenceReceiptId === capsule.source?.evidenceReceiptId &&
    receipt.policySha256 === policySha256 &&
    receipt.projectionSha256 === projectionSha256;

  return {
    valid: audit.valid && receiptMatches,
    reason: !audit.valid
      ? "disclosure-drift"
      : receiptMatches
        ? "verified"
        : "disclosure-receipt-mismatch",
    expectedReceiptId,
    actualReceiptId: receipt.receiptId || null,
    audit,
  };
}
