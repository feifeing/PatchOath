import { CHECKPOINT_ID_PREFIX, LEGACY_CHECKPOINT_ID_PREFIX } from "./brand.mjs";
import { isPrefixedStorageId } from "./storage-key.mjs";

export const CHECKPOINT_SCHEMA_VERSION = 2;
export const CONFIG_SCHEMA_VERSION = 1;
export const STATE_SCHEMA_VERSION = 1;
export const SESSION_SCHEMA_VERSION = 1;

const CHECKPOINT_PREFIXES = [CHECKPOINT_ID_PREFIX, LEGACY_CHECKPOINT_ID_PREFIX];
const SESSION_PREFIXES = ["session"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validCheckpointId(value) {
  return isPrefixedStorageId(value, CHECKPOINT_PREFIXES);
}

export function validSessionId(value) {
  return isPrefixedStorageId(value, SESSION_PREFIXES);
}

export function validateCheckpoint(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["Checkpoint must be an object."] };
  }
  if (value.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${CHECKPOINT_SCHEMA_VERSION}.`);
  }
  if (!validCheckpointId(value.id)) {
    issues.push(
      `id must be a stable ${CHECKPOINT_ID_PREFIX}_* identifier or legacy ${LEGACY_CHECKPOINT_ID_PREFIX}_* identifier.`,
    );
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length < 4) {
    issues.push("sessionId is required.");
  }
  if (!["recording", "completed"].includes(value.status)) {
    issues.push("status must be recording or completed.");
  }
  if (!value.prompt || !hasText(value.prompt.text)) {
    issues.push("prompt.text is required.");
  }
  if (!value.repository || typeof value.repository.head !== "string") {
    issues.push("repository.head is required.");
  }
  if (!value.before || typeof value.before.commit !== "string") {
    issues.push("before.commit is required.");
  }
  if (value.status === "completed") {
    if (!value.after || typeof value.after.commit !== "string")
      issues.push("after.commit is required when completed.");
    if (!value.analysis || !Array.isArray(value.analysis.files)) {
      issues.push("analysis.files is required when completed.");
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateConfig(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["Config must be an object."] };
  }
  if (value.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}.`);
  }
  if (!validSessionId(value.currentSessionId)) {
    issues.push(
      "currentSessionId must be a repository-local session_* identifier.",
    );
  }
  if (!hasText(value.createdAt)) {
    issues.push("createdAt is required.");
  }
  if (value.updatedAt !== undefined && !hasText(value.updatedAt)) {
    issues.push("updatedAt must be a non-empty string when present.");
  }
  if (value.visual !== undefined) {
    if (!isRecord(value.visual)) {
      issues.push("visual must be an object when present.");
    } else {
      const viewport = value.visual.viewport;
      if (!isRecord(viewport)) {
        issues.push(
          "visual.viewport must be an object when visual is present.",
        );
      } else if (
        !Number.isInteger(viewport.width) ||
        viewport.width <= 0 ||
        !Number.isInteger(viewport.height) ||
        viewport.height <= 0
      ) {
        issues.push(
          "visual.viewport width and height must be positive integers.",
        );
      }
      if (
        value.visual.waitMs !== undefined &&
        (!Number.isFinite(value.visual.waitMs) || value.visual.waitMs < 0)
      ) {
        issues.push("visual.waitMs must be a non-negative finite number.");
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateState(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["State must be an object."] };
  }
  if (value.schemaVersion !== STATE_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${STATE_SCHEMA_VERSION}.`);
  }
  if (
    value.activeCheckpointId !== null &&
    !validCheckpointId(value.activeCheckpointId)
  ) {
    issues.push(
      `activeCheckpointId must be null, a ${CHECKPOINT_ID_PREFIX}_* identifier, or a legacy ${LEGACY_CHECKPOINT_ID_PREFIX}_* identifier.`,
    );
  }
  return { valid: issues.length === 0, issues };
}

export function validateSession(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { valid: false, issues: ["Session must be an object."] };
  }
  if (value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${SESSION_SCHEMA_VERSION}.`);
  }
  if (!validSessionId(value.id)) {
    issues.push("id must be a repository-local session_* identifier.");
  }
  if (!hasText(value.createdAt)) {
    issues.push("createdAt is required.");
  }
  if (value.updatedAt !== undefined && !hasText(value.updatedAt)) {
    issues.push("updatedAt must be a non-empty string when present.");
  }
  if (
    value.name !== undefined &&
    value.name !== null &&
    typeof value.name !== "string"
  ) {
    issues.push("name must be a string or null when present.");
  }
  if (!Array.isArray(value.checkpoints)) {
    issues.push("checkpoints must be an array.");
  } else {
    for (const checkpointId of value.checkpoints) {
      if (!validCheckpointId(checkpointId)) {
        issues.push(
          `checkpoints may contain only ${CHECKPOINT_ID_PREFIX}_* or legacy ${LEGACY_CHECKPOINT_ID_PREFIX}_* identifiers.`,
        );
        break;
      }
    }
    if (new Set(value.checkpoints).size !== value.checkpoints.length) {
      issues.push("checkpoints must not contain duplicate identifiers.");
    }
  }
  return { valid: issues.length === 0, issues };
}

function assertSchema(kind, value, validator) {
  const result = validator(value);
  if (!result.valid) {
    const error = new Error(`Invalid ${kind}: ${result.issues.join(" ")}`);
    error.code = "PATCHOATH_INVALID_EVIDENCE_SCHEMA";
    throw error;
  }
  return value;
}

export function assertValidCheckpoint(value) {
  return assertSchema("checkpoint", value, validateCheckpoint);
}

export function assertValidConfig(value) {
  return assertSchema("config", value, validateConfig);
}

export function assertValidState(value) {
  return assertSchema("state", value, validateState);
}

export function assertValidSession(value) {
  return assertSchema("session", value, validateSession);
}
