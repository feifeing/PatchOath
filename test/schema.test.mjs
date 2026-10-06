import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCheckpoint,
  validateConfig,
  validateSession,
  validateState,
} from "../src/core/schema.mjs";

function recordingCheckpoint(id) {
  return {
    schemaVersion: 2,
    id,
    sessionId: "session_example",
    status: "recording",
    prompt: { text: "Change the button color" },
    repository: { head: "abc" },
    before: { commit: "abc" },
  };
}

test("completed checkpoints require both snapshots and analysis", () => {
  const result = validateCheckpoint({
    ...recordingCheckpoint("po_example"),
    status: "completed",
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("after.commit")));
  assert.ok(result.issues.some((issue) => issue.includes("analysis.files")));
});

test("recording PatchOath checkpoints are valid before an after snapshot exists", () => {
  assert.deepEqual(validateCheckpoint(recordingCheckpoint("po_example")), {
    valid: true,
    issues: [],
  });
});

test("legacy vt checkpoints remain schema-valid for migration compatibility", () => {
  assert.deepEqual(validateCheckpoint(recordingCheckpoint("vt_example")), {
    valid: true,
    issues: [],
  });
});

test("historical checkpoint session metadata remains compatible", () => {
  assert.deepEqual(
    validateCheckpoint({
      ...recordingCheckpoint("vt_legacy_session"),
      sessionId: "legacy-session",
    }),
    { valid: true, issues: [] },
  );
});

test("unrecognized checkpoint namespaces are rejected", () => {
  const result = validateCheckpoint(recordingCheckpoint("other_example"));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => /po_\*.*legacy vt_\*/u.test(issue)));
});

test("config schema rejects unsafe session keys and invalid visual settings", () => {
  const result = validateConfig({
    schemaVersion: 1,
    currentSessionId: "../outside",
    createdAt: "2026-09-08T00:00:00.000Z",
    visual: { viewport: { width: 0, height: 900 }, waitMs: -1 },
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("currentSessionId")));
  assert.ok(result.issues.some((issue) => issue.includes("positive integers")));
  assert.ok(result.issues.some((issue) => issue.includes("non-negative")));
});

test("state schema rejects path-like active checkpoint identifiers", () => {
  const result = validateState({
    schemaVersion: 1,
    activeCheckpointId: "../po_outside",
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.includes("activeCheckpointId")),
  );
});

test("session schema rejects unsafe and duplicate checkpoint references", () => {
  const result = validateSession({
    schemaVersion: 1,
    id: "session_example",
    createdAt: "2026-09-08T00:00:00.000Z",
    checkpoints: ["po_good", "../po_bad", "po_good"],
  });
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.includes("checkpoints may contain")),
  );
  assert.ok(result.issues.some((issue) => issue.includes("duplicate")));
});
