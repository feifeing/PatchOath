import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createDoctorRepairPlan } from "../src/core/doctor-plan.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { createRepository, memoryStream } from "../test-support/helpers.mjs";

function diagnosis(checks, overrides = {}) {
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) summary[check.status] += 1;
  return {
    version: 1,
    status: summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass",
    healthy: summary.fail === 0,
    repository: { name: "fixture", branch: "main", head: "a".repeat(40) },
    store: null,
    summary,
    checks,
    ...overrides,
  };
}

function check(id, status, details = undefined) {
  return {
    id,
    status,
    message: `${id} ${status}`,
    ...(details ? { details } : {}),
  };
}

test("healthy diagnoses produce a deterministic no-action proposal", () => {
  const source = diagnosis([
    check("git.repository", "pass"),
    check("trust.graph", "pass"),
  ]);
  const first = createDoctorRepairPlan(source);
  const second = createDoctorRepairPlan(source);

  assert.equal(first.version, 1);
  assert.equal(first.mode, "proposal-only");
  assert.equal(first.status, "no-action");
  assert.equal(first.applySupported, false);
  assert.equal(first.mutationsApplied, false);
  assert.equal(first.items.length, 0);
  assert.match(first.proposalDigest, /^[a-f0-9]{64}$/u);
  assert.equal(first.proposalDigest, second.proposalDigest);
  assert.equal(first.authorityBoundary.diagnosisGrantsRepairAuthority, false);
  assert.equal(first.authorityBoundary.proposalGrantsRepairAuthority, false);
});

test("receipt mismatches propose preservation and investigation, never receipt regeneration", () => {
  const plan = createDoctorRepairPlan(
    diagnosis([
      check("receipts.integrity", "fail", [
        "po_example: evidence-mismatch",
      ]),
    ]),
  );
  const item = plan.items[0];

  assert.equal(plan.status, "review-required");
  assert.equal(item.operation, "preserve-receipt-mismatch");
  assert.equal(item.category, "investigation");
  assert.equal(item.mutatesEvidence, false);
  assert.equal(item.explicitAuthorityRequired, false);
  assert.equal(item.applySupported, false);
  assert.match(item.rationale, /Regenerating a receipt/iu);
  assert.ok(
    item.prerequisites.some((value) =>
      value.includes("Do not overwrite or regenerate"),
    ),
  );
});

test("Git snapshot failures are conditional repair candidates requiring explicit authority", () => {
  const plan = createDoctorRepairPlan(
    diagnosis([
      check("git.snapshots", "fail", [
        "po_example/before: no PatchOath compatibility ref exists",
      ]),
    ]),
  );
  const item = plan.items[0];

  assert.equal(item.operation, "recover-git-snapshot-binding");
  assert.equal(item.category, "conditional-repair");
  assert.equal(item.mutatesEvidence, true);
  assert.equal(item.explicitAuthorityRequired, true);
  assert.equal(item.applySupported, false);
  assert.equal(
    plan.authorityBoundary.explicitMutationAuthorityRequired,
    true,
  );
  assert.deepEqual(item.findings, [
    "po_example/before: no PatchOath compatibility ref exists",
  ]);
});

test("unmapped diagnostics fail conservative instead of inventing a repair", () => {
  const plan = createDoctorRepairPlan(
    diagnosis([check("future.integrity", "fail", ["new failure shape"])]),
  );
  const item = plan.items[0];

  assert.equal(item.operation, "investigate-unmapped-diagnostic");
  assert.equal(item.category, "investigation");
  assert.equal(item.mutatesEvidence, false);
  assert.equal(item.applySupported, false);
  assert.match(item.rationale, /does not invent a repair procedure/iu);
});

test("repair plans contain no executable command surface", () => {
  const plan = createDoctorRepairPlan(
    diagnosis([
      check("trust.graph", "fail", ["active checkpoint po_missing is missing"]),
      check("capsules.integrity", "fail", ["capsule mismatch"]),
    ]),
  );

  for (const item of plan.items) {
    assert.equal(Object.hasOwn(item, "command"), false);
    assert.equal(Object.hasOwn(item, "shell"), false);
    assert.equal(Object.hasOwn(item, "argv"), false);
    assert.equal(item.applySupported, false);
  }
});

test("doctor --plan remains read-only for an uninitialized repository", async () => {
  const root = await createRepository();
  try {
    const stdout = memoryStream();
    const stderr = memoryStream();
    const exitCode = await runDoctor(["--plan", "--json"], {
      cwd: root,
      stdout,
      stderr,
    });
    assert.equal(exitCode, 0, stderr.value());
    const result = JSON.parse(stdout.value());
    assert.equal(result.healthy, true);
    assert.equal(result.store.exists, false);
    assert.equal(result.repairPlan.mode, "proposal-only");
    assert.equal(result.repairPlan.applySupported, false);
    assert.equal(result.repairPlan.mutationsApplied, false);
    assert.equal(result.repairPlan.items.length, 1);
    assert.equal(result.repairPlan.items[0].operation, "initialize-store");
    assert.equal(result.repairPlan.items[0].category, "optional-setup");
    await assert.rejects(access(join(root, ".patchoath")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
