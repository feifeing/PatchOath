import { createHash } from "node:crypto";

const PLAN_VERSION = 1;

const STRATEGIES = {
  "store.selection": {
    warn: {
      operation: "review-store-selection",
      category: "manual-review",
      mutatesEvidence: false,
      summary:
        "Review the modern and legacy stores separately before deciding whether any migration is appropriate.",
      rationale:
        "Automatic merging or deletion could destroy legacy evidence or change which store PatchOath selects.",
      prerequisites: [
        "Confirm which store contains the evidence that must remain authoritative.",
        "Verify legacy Evidence Receipts before any migration decision.",
      ],
    },
  },
  "store.integrity": {
    warn: {
      operation: "initialize-store",
      category: "optional-setup",
      mutatesEvidence: true,
      summary:
        "Initialize PatchOath only if this repository should begin recording local evidence.",
      rationale:
        "An absent store is not corruption; initialization is a new user-authorized mutation.",
      prerequisites: ["Explicitly choose to start PatchOath evidence recording."],
    },
    fail: {
      operation: "preserve-and-inspect-store",
      category: "investigation",
      mutatesEvidence: false,
      summary:
        "Preserve the current store bytes and investigate the unsafe or malformed managed evidence before attempting repair.",
      rationale:
        "Rewriting a store that cannot be read safely may erase the evidence needed to understand the failure.",
      prerequisites: [
        "Make a byte-preserving backup outside the managed store.",
        "Resolve filesystem safety issues before editing JSON content.",
      ],
    },
  },
  "sessions.storage": {
    fail: {
      operation: "restore-session-records",
      category: "manual-recovery",
      mutatesEvidence: true,
      summary:
        "Restore malformed or identity-confused session records from a trusted copy instead of rewriting IDs in place.",
      rationale:
        "A storage-key/content mismatch can be evidence of accidental corruption or deliberate substitution.",
      prerequisites: [
        "Preserve the rejected session file bytes.",
        "Identify a trusted source for the intended session record.",
      ],
    },
  },
  "checkpoints.storage": {
    fail: {
      operation: "restore-checkpoint-records",
      category: "manual-recovery",
      mutatesEvidence: true,
      summary:
        "Restore invalid checkpoint records from trusted evidence; do not rename or rewrite a record merely to satisfy its filename.",
      rationale:
        "Checkpoint identity participates in refs, sessions, receipts, reviews, and disclosure links.",
      prerequisites: [
        "Preserve the rejected checkpoint bytes.",
        "Validate the intended checkpoint identity against Git refs and any external trusted copy.",
      ],
    },
  },
  "trust.graph": {
    fail: {
      operation: "reconcile-trust-graph",
      category: "conditional-repair",
      mutatesEvidence: true,
      summary:
        "Reconcile session indexes or active-state pointers only from already-validated checkpoint and session evidence.",
      rationale:
        "Graph indexes are repairable only when the underlying records provide an unambiguous source of truth.",
      prerequisites: [
        "Session and checkpoint storage checks must pass first.",
        "Do not delete orphan evidence merely to make the graph appear consistent.",
        "Require explicit mutation authority before changing state or session indexes.",
      ],
    },
  },
  "receipts.integrity": {
    fail: {
      operation: "preserve-receipt-mismatch",
      category: "investigation",
      mutatesEvidence: false,
      summary:
        "Treat the receipt mismatch as evidence corruption or tampering and preserve the checkpoint exactly as found.",
      rationale:
        "Regenerating a receipt over changed checkpoint bytes would erase the signal that the original evidence no longer matches.",
      prerequisites: [
        "Do not overwrite or regenerate the stored Evidence Receipt.",
        "Compare the checkpoint with a trusted backup or review the unexpected byte-level change.",
      ],
    },
  },
  "git.snapshots": {
    fail: {
      operation: "recover-git-snapshot-binding",
      category: "conditional-repair",
      mutatesEvidence: true,
      summary:
        "Recover Git snapshot bindings only when the recorded commit object still exists and the checkpoint receipt remains trustworthy.",
      rationale:
        "A missing ref may be re-anchorable from an existing recorded object, while a missing Git object requires recovery from another source.",
      prerequisites: [
        "Distinguish missing refs from missing Git commit objects.",
        "Require the relevant checkpoint Evidence Receipt to verify before re-anchoring any ref.",
        "If the commit object is missing, recover it from a trusted repository or backup rather than fabricating a replacement.",
      ],
    },
  },
  "reviews.integrity": {
    fail: {
      operation: "restore-review-record",
      category: "manual-recovery",
      mutatesEvidence: true,
      summary:
        "Restore invalid Historical Effect Review bytes from a trusted copy or create a new review instead of editing the historical record in place.",
      rationale:
        "Historical review is separately receipt-bound and must not be silently rewritten to fit a changed checkpoint.",
      prerequisites: [
        "Preserve the rejected review bytes.",
        "Verify the source checkpoint and Evidence Receipt before recording any replacement review.",
      ],
    },
  },
  "capsules.integrity": {
    warn: {
      operation: "inspect-unrecognized-capsule-files",
      category: "manual-review",
      mutatesEvidence: false,
      summary:
        "Inspect unrecognized files in the managed capsule directory without deleting or importing them automatically.",
      rationale:
        "Unknown files may be unrelated user material and are outside PatchOath's managed capsule naming contract.",
      prerequisites: ["Determine file ownership before moving or deleting anything."],
    },
    fail: {
      operation: "recreate-managed-capsule",
      category: "conditional-repair",
      mutatesEvidence: true,
      summary:
        "Preserve the invalid capsule and, if its source checkpoint still verifies, create a new minimum-disclosure capsule as a separate artifact.",
      rationale:
        "Overwriting an invalid capsule would destroy the evidence of disclosure drift or receipt mismatch.",
      prerequisites: [
        "The source checkpoint and Evidence Receipt must verify.",
        "Keep the invalid capsule unchanged for investigation.",
        "Create any replacement as a new artifact rather than silently overwriting the failed one.",
      ],
    },
  },
};

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

function proposalItem(check, strategy) {
  return {
    id: `repair:${check.id}`,
    checkId: check.id,
    sourceStatus: check.status,
    operation: strategy.operation,
    category: strategy.category,
    mutatesEvidence: strategy.mutatesEvidence,
    applySupported: false,
    explicitAuthorityRequired: Boolean(strategy.mutatesEvidence),
    summary: strategy.summary,
    rationale: strategy.rationale,
    prerequisites: [...strategy.prerequisites],
    findings: Array.isArray(check.details) ? [...check.details] : [],
  };
}

export function createDoctorRepairPlan(diagnosis) {
  const items = [];
  for (const check of diagnosis?.checks || []) {
    if (check.status === "pass") continue;
    const strategy = STRATEGIES[check.id]?.[check.status];
    if (!strategy) {
      items.push({
        id: `repair:${check.id}`,
        checkId: check.id,
        sourceStatus: check.status,
        operation: "investigate-unmapped-diagnostic",
        category: "investigation",
        mutatesEvidence: false,
        applySupported: false,
        explicitAuthorityRequired: false,
        summary:
          "Investigate this diagnostic without modifying managed evidence until a check-specific recovery rule exists.",
        rationale:
          "PatchOath does not invent a repair procedure for a diagnostic it cannot map deterministically.",
        prerequisites: ["Preserve the current evidence before manual investigation."],
        findings: Array.isArray(check.details) ? [...check.details] : [],
      });
      continue;
    }
    items.push(proposalItem(check, strategy));
  }

  const body = {
    version: PLAN_VERSION,
    mode: "proposal-only",
    diagnosisVersion: diagnosis?.version ?? null,
    diagnosisStatus: diagnosis?.status ?? null,
    healthyAtPlanningTime: Boolean(diagnosis?.healthy),
    applySupported: false,
    mutationsApplied: false,
    authorityBoundary: {
      diagnosisGrantsRepairAuthority: false,
      proposalGrantsRepairAuthority: false,
      explicitMutationAuthorityRequired: items.some(
        (item) => item.explicitAuthorityRequired,
      ),
    },
    status: items.length === 0 ? "no-action" : "review-required",
    items,
  };

  return {
    ...body,
    proposalDigest: sha256(body),
  };
}

export { PLAN_VERSION as DOCTOR_REPAIR_PLAN_VERSION };
