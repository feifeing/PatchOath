export const BRAND_NAME = "PatchOath";
export const CLI_NAME = "patchoath";
export const PACKAGE_NAME = "patchoath";
export const VERSION = "0.3.0";
export const TAGLINE = "Make every AI patch prove it stayed in scope.";

export const STORE_DIRECTORY_NAME = ".patchoath";
export const LEGACY_STORE_DIRECTORY_NAME = ".vibetrace";

export const REF_NAMESPACE = "refs/patchoath";
export const LEGACY_REF_NAMESPACE = "refs/vibetrace";

// Modern prefixes identify evidence created by PatchOath v0.3 and later.
export const CHECKPOINT_ID_PREFIX = "po";
export const LEGACY_CHECKPOINT_ID_PREFIX = "vt";
export const EVIDENCE_RECEIPT_PREFIX = "poe";
export const CONTRACT_DELTA_RECEIPT_PREFIX = "pocd";
export const DISCLOSURE_RECEIPT_PREFIX = "pod";
export const REVIEW_RECORD_PREFIX = "por";

// Legacy prefixes remain verification inputs only; new evidence uses PatchOath namespaces.
export const LEGACY_EVIDENCE_RECEIPT_PREFIX = "vtr";
export const LEGACY_CONTRACT_DELTA_RECEIPT_PREFIX = "vtcd";
export const LEGACY_DISCLOSURE_RECEIPT_PREFIX = "vtd";
export const LEGACY_REVIEW_RECORD_PREFIX = "vrr";

export function checkpointRef(checkpointId, phase, namespace = REF_NAMESPACE) {
  return `${namespace}/checkpoints/${checkpointId}/${phase}`;
}

export function checkpointRefCandidates(checkpoint, phase) {
  const candidates = [
    checkpoint?.[phase]?.ref || null,
    checkpointRef(checkpoint?.id, phase, REF_NAMESPACE),
    checkpointRef(checkpoint?.id, phase, LEGACY_REF_NAMESPACE),
  ].filter(Boolean);
  return [...new Set(candidates)];
}

export function hasLegacyPrefix(value, prefix) {
  return typeof value === "string" && value.startsWith(`${prefix}_`);
}
