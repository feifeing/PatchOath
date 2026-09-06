import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { runContractDelta } from "../src/contract-delta.mjs";
import { computeObservedContractDelta } from "../src/core/contract-delta.mjs";
import { createEvidenceReceipt } from "../src/core/receipt.mjs";
import { initializeStore, saveCheckpoint } from "../src/core/store.mjs";
import {
  createRepository,
  git,
  memoryStream,
} from "../test-support/helpers.mjs";

function baseAnalysis() {
  return {
    files: [],
    summary: {
      filesChanged: 2,
      linesChanged: 2,
      additions: 2,
      deletions: 0,
      modulesChanged: 2,
      directoriesChanged: 2,
      binaryFiles: 0,
    },
    contractCompliance: {
      declared: true,
      status: "violated",
      violations: [{ id: "outside-authorized-scope", detail: "cached" }],
    },
    blastRadius: {
      score: 32,
      level: "expanded",
      intentMismatch: { detected: false },
      authorizationDrift: true,
    },
    risk: {
      score: 18,
      level: "low",
      model: "patchoath-evidence-risk-v2",
      factors: [],
    },
  };
}

function buildCheckpoint({ root, sessionId, before, after, authorization }) {
  const checkpoint = {
    schemaVersion: 2,
    id: "po_contract_delta_fixture",
    sessionId,
    status: "completed",
    createdAt: "2026-09-03T01:00:00.000Z",
    completedAt: "2026-09-03T01:01:00.000Z",
    prompt: { text: "Refine the UI only", source: "manual-cli" },
    authorization,
    repository: { head: before },
    before: { commit: before },
    after: { commit: after },
    analysis: baseAnalysis(),
    visual: null,
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  return checkpoint;
}

async function createTwoModuleCheckpoint() {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const before = git(root, ["rev-parse", "HEAD"]);
  await mkdir(join(root, "src", "ui"), { recursive: true });
  await mkdir(join(root, "src", "utils"), { recursive: true });
  await writeFile(
    join(root, "src", "ui", "button.js"),
    "export const ui = 1;\n",
  );
  await writeFile(
    join(root, "src", "utils", "helper.js"),
    "export const helper = 1;\n",
  );
  git(root, ["add", "src"]);
  git(root, ["commit", "-m", "observed effect"]);
  const after = git(root, ["rev-parse", "HEAD"]);
  const checkpoint = buildCheckpoint({
    root,
    sessionId: config.currentSessionId,
    before,
    after,
    authorization: {
      version: 1,
      mode: "explicit-user-authorization",
      allow: ["src/ui/**"],
      deny: [],
      protectedSurfaces: [],
      maxFiles: 1,
      maxLines: 1,
      maxModules: 1,
    },
  });
  await saveCheckpoint(root, checkpoint);
  return { root, checkpoint };
}

test("CLI recomputes observed effect from Git objects instead of cached analysis.files", async () => {
  const { root, checkpoint } = await createTwoModuleCheckpoint();
  assert.deepEqual(checkpoint.analysis.files, []);

  const stdout = memoryStream();
  const stderr = memoryStream();
  assert.equal(
    await runContractDelta([checkpoint.id, "--json"], {
      cwd: root,
      stdout,
      stderr,
    }),
    0,
  );
  assert.equal(stderr.value(), "");
  const result = JSON.parse(stdout.value());
  assert.equal(result.status, "proposal-ready");
  assert.equal(result.observedEffectSource, "recomputed-before-after-git-diff");
  assert.deepEqual(result.delta.exactAllowAdditions, [
    {
      path: "src/utils/helper.js",
      representable: true,
      rationale: "exact-observed-path-only",
    },
  ]);
  assert.equal(result.delta.budgets.maxFiles.to, 2);
  assert.equal(result.delta.budgets.maxLines.to, 2);
  assert.equal(result.delta.budgets.maxModules.to, 2);
  assert.equal(result.counterfactual.status, "compliant");
  assert.match(result.proposalReceipt.receiptId, /^pocd_[a-f0-9]{24}$/u);
});

test("protected surfaces are never proposed as automatic relaxations", async () => {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const head = git(root, ["rev-parse", "HEAD"]);
  const checkpoint = buildCheckpoint({
    root,
    sessionId: config.currentSessionId,
    before: head,
    after: head,
    authorization: {
      version: 1,
      mode: "explicit-user-authorization",
      allow: ["src/ui/**"],
      deny: [],
      protectedSurfaces: ["auth"],
      maxFiles: 4,
      maxLines: 20,
      maxModules: 4,
    },
  });
  const result = computeObservedContractDelta(checkpoint, [
    {
      path: "src/auth/session.js",
      oldPath: null,
      status: "modified",
      additions: 1,
      deletions: 0,
      binary: false,
    },
  ]);

  assert.equal(result.status, "human-review-required");
  assert.deepEqual(result.delta.protectedRelaxations, []);
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.id === "protected-surface-requires-human-review",
    ),
  );
  assert.equal(
    result.delta.exactAllowAdditions.some(
      (addition) => addition.path === "src/auth/session.js",
    ),
    false,
  );
  assert.equal(result.counterfactual.status, "violated");
});

test("tampered source evidence cannot generate an authority proposal", async () => {
  const { checkpoint } = await createTwoModuleCheckpoint();
  checkpoint.prompt.text = "tampered prompt";

  assert.throws(
    () =>
      computeObservedContractDelta(checkpoint, [
        {
          path: "src/utils/helper.js",
          status: "added",
          additions: 1,
          deletions: 0,
          binary: false,
        },
      ]),
    /Refusing to propose authorization changes from unverified evidence/u,
  );
});

test("proposal receipt is deterministic for the same normalized Git effect", async () => {
  const { checkpoint } = await createTwoModuleCheckpoint();
  const files = [
    {
      path: "src/utils/helper.js",
      status: "added",
      additions: 1,
      deletions: 0,
      binary: false,
    },
    {
      path: "src/ui/button.js",
      status: "added",
      additions: 1,
      deletions: 0,
      binary: false,
    },
  ];
  const first = computeObservedContractDelta(checkpoint, files);
  const second = computeObservedContractDelta(checkpoint, [...files].reverse());
  assert.equal(
    first.proposalReceipt.receiptId,
    second.proposalReceipt.receiptId,
  );
});
