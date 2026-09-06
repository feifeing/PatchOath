import { createHash } from "node:crypto";
import { CONTRACT_DELTA_RECEIPT_PREFIX } from "./brand.mjs";
import { createChangeContract, evaluateChangeContract } from "./contract.mjs";
import { verifyEvidenceReceipt } from "./receipt.mjs";

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

function normalizedFiles(files = []) {
  return files
    .map((file) => ({
      path: String(file.path || "").replaceAll("\\", "/"),
      oldPath: file.oldPath ? String(file.oldPath).replaceAll("\\", "/") : null,
      status: file.status || null,
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      binary: Boolean(file.binary),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function unsafeExactPath(path) {
  return path.includes("*");
}

function limitDelta(name, current, observed) {
  if (current === null || current === undefined || observed <= current)
    return null;
  return {
    field: name,
    from: current,
    to: observed,
    increase: observed - current,
    rationale: "raise-only-to-observed-total",
  };
}

function protectedBlockers(compliance) {
  const violationIds = new Set(
    (compliance.violations || []).map((violation) => violation.id),
  );
  const blockers = [];
  if (violationIds.has("protected-path-touched")) {
    blockers.push({
      id: "protected-path-requires-human-review",
      files: uniqueSorted(compliance.protectedFiles || []),
      proposedRelaxation: null,
      reason:
        "PatchOath never proposes removing an explicit deny rule from observed effect alone.",
    });
  }
  if (violationIds.has("protected-surface-touched")) {
    blockers.push({
      id: "protected-surface-requires-human-review",
      surfaces: uniqueSorted(compliance.protectedSurfacesTouched || []),
      files: uniqueSorted(compliance.protectedSurfaceFiles || []),
      proposedRelaxation: null,
      reason:
        "PatchOath never proposes unprotecting a sensitive surface from observed effect alone.",
    });
  }
  return blockers;
}

function exactAllowDelta(contract, compliance) {
  if (!Array.isArray(contract.allow) || contract.allow.length === 0) return [];
  const protectedFiles = new Set(compliance.protectedFiles || []);
  return uniqueSorted(compliance.unauthorizedFiles || [])
    .filter((path) => !protectedFiles.has(path))
    .map((path) => ({
      path,
      representable: !unsafeExactPath(path),
      rationale: !unsafeExactPath(path)
        ? "exact-observed-path-only"
        : "path-contains-glob-metacharacter",
    }));
}

function proposedContract(contract, exactAllows, budgets) {
  if (exactAllows.some((item) => !item.representable)) return null;
  return createChangeContract({
    allow: [...contract.allow, ...exactAllows.map((item) => item.path)],
    deny: contract.deny,
    protectedSurfaces: contract.protectedSurfaces,
    maxFiles: budgets.maxFiles?.to ?? contract.maxFiles,
    maxLines: budgets.maxLines?.to ?? contract.maxLines,
    maxModules: budgets.maxModules?.to ?? contract.maxModules,
  });
}

export function computeObservedContractDelta(checkpoint, observedFiles) {
  if (checkpoint?.status !== "completed") {
    throw new Error("A completed checkpoint is required.");
  }
  if (!Array.isArray(observedFiles)) {
    throw new Error(
      "Recomputed before/after Git diff evidence is required for contract-delta analysis.",
    );
  }
  const sourceVerification = verifyEvidenceReceipt(checkpoint);
  if (!sourceVerification.valid) {
    throw new Error(
      `Refusing to propose authorization changes from unverified evidence: ${sourceVerification.reason}.`,
    );
  }
  if (!checkpoint.authorization) {
    return {
      version: 1,
      kind: "patchoath-observed-contract-delta",
      checkpointId: checkpoint.id,
      sourceEvidenceReceiptId: checkpoint.receipt.receiptId,
      sourceReceiptVerified: true,
      gitEffectRecomputed: true,
      status: "not-applicable",
      reason: "no-explicit-change-contract",
      note: "Without an explicit starting contract there is no authorization boundary to repair.",
    };
  }

  const files = normalizedFiles(observedFiles);
  const original = structuredClone(checkpoint.authorization);
  const compliance = evaluateChangeContract(original, files);
  const observed = compliance.totals;
  const exactAllows = exactAllowDelta(original, compliance);
  const budgets = {
    maxFiles: limitDelta("maxFiles", original.maxFiles, observed.files),
    maxLines: limitDelta("maxLines", original.maxLines, observed.lines),
    maxModules: limitDelta("maxModules", original.maxModules, observed.modules),
  };
  const blockers = protectedBlockers(compliance);
  const unrepresentable = exactAllows
    .filter((item) => !item.representable)
    .map((item) => item.path);
  if (unrepresentable.length > 0) {
    blockers.push({
      id: "exact-path-cannot-be-safely-expressed",
      files: unrepresentable,
      proposedRelaxation: null,
      reason:
        "The current Change Contract uses glob syntax, so a literal path containing '*' cannot be proposed as an exact grant without widening meaning.",
    });
  }

  const candidate = proposedContract(original, exactAllows, budgets);
  const counterfactual = candidate
    ? evaluateChangeContract(candidate, files)
    : null;
  const delta = {
    exactAllowAdditions: exactAllows,
    budgets,
    protectedRelaxations: [],
  };
  const hasDelta =
    exactAllows.length > 0 || Object.values(budgets).some(Boolean);
  const status =
    compliance.status === "compliant"
      ? "already-compliant"
      : blockers.length > 0
        ? "human-review-required"
        : counterfactual?.status === "compliant"
          ? "proposal-ready"
          : "incomplete-proposal";

  const receiptBody = {
    checkpointId: checkpoint.id,
    sourceEvidenceReceiptId: checkpoint.receipt.receiptId,
    originalContractSha256: sha256(original),
    observedEffectSha256: sha256(files),
    delta,
    blockers,
    counterfactualStatus: counterfactual?.status || null,
  };

  return {
    version: 1,
    kind: "patchoath-observed-contract-delta",
    checkpointId: checkpoint.id,
    sourceEvidenceReceiptId: checkpoint.receipt.receiptId,
    sourceReceiptVerified: true,
    gitEffectRecomputed: true,
    observedEffectSource: "recomputed-before-after-git-diff",
    status,
    originalCompliance: compliance,
    observed,
    delta,
    blockers,
    candidateContract: candidate,
    counterfactual: counterfactual
      ? {
          status: counterfactual.status,
          violations: counterfactual.violations,
        }
      : null,
    minimality: {
      model: "restricted-local-delta-v1",
      claim:
        "Minimal only within PatchOath's restricted proposal vocabulary: exact observed file grants plus budget increases to observed totals. It is not a globally minimal access-control policy.",
      neverProposed: [
        "remove-deny",
        "unprotect-sensitive-surface",
        "broad-glob",
      ],
      hasMechanicalDelta: hasDelta,
    },
    proposalReceipt: {
      algorithm: "sha256",
      receiptId: `${CONTRACT_DELTA_RECEIPT_PREFIX}_${sha256(receiptBody).slice(0, 24)}`,
      originalContractSha256: receiptBody.originalContractSha256,
      observedEffectSha256: receiptBody.observedEffectSha256,
      sourceEvidenceReceiptId: receiptBody.sourceEvidenceReceiptId,
    },
  };
}
