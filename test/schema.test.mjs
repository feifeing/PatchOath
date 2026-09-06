import assert from "node:assert/strict";
import test from "node:test";
import { validateCheckpoint } from "../src/core/schema.mjs";

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

test("unrecognized checkpoint namespaces are rejected", () => {
  const result = validateCheckpoint(recordingCheckpoint("other_example"));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => /po_\*.*legacy vt_\*/u.test(issue)));
});
