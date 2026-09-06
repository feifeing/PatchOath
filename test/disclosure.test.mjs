import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCapsule } from "../src/capsule.mjs";
import {
  auditDisclosureCapsule,
  createDisclosureCapsule,
  createDisclosurePolicy,
  verifyDisclosureCapsule,
} from "../src/core/disclosure.mjs";
import { createEvidenceReceipt } from "../src/core/receipt.mjs";
import { initializeStore, saveCheckpoint } from "../src/core/store.mjs";
import {
  createRepository,
  git,
  memoryStream,
} from "../test-support/helpers.mjs";

const SECRET_PROMPT =
  "Fix ACME customer login without exposing Project Nightjar";
const SECRET_PATH = "src/customers/acme/nightjar-auth.js";
const SECRET_PATTERN = "src/customers/acme/**";

function checkpointFixture(root, sessionId) {
  const head = git(root, ["rev-parse", "HEAD"]);
  const checkpoint = {
    schemaVersion: 2,
    id: "po_disclosure_fixture",
    sessionId,
    status: "completed",
    createdAt: "2026-09-03T00:00:00.000Z",
    completedAt: "2026-09-03T00:01:00.000Z",
    prompt: { text: SECRET_PROMPT, source: "manual-cli" },
    authorization: {
      version: 1,
      mode: "explicit-user-authorization",
      allow: [SECRET_PATTERN],
      deny: ["src/auth/**"],
      protectedSurfaces: ["database"],
      maxFiles: 3,
      maxLines: 80,
      maxModules: 1,
    },
    repository: { head },
    before: { commit: head },
    after: { commit: head },
    analysis: {
      files: [
        {
          path: SECRET_PATH,
          oldPath: null,
          status: "modified",
          additions: 4,
          deletions: 1,
          binary: false,
          signals: ["auth"],
        },
      ],
      summary: {
        filesChanged: 1,
        linesChanged: 5,
        additions: 4,
        deletions: 1,
        modulesChanged: 1,
        directoriesChanged: 1,
        binaryFiles: 0,
      },
      contractCompliance: {
        declared: true,
        status: "compliant",
        violations: [],
      },
      blastRadius: {
        score: 18,
        level: "contained",
        intentMismatch: { detected: false },
        authorizationDrift: false,
      },
      risk: {
        score: 7,
        level: "low",
        model: "patchoath-evidence-risk-v2",
        factors: [
          {
            id: "file-scope",
            label: "File scope",
            points: 2,
            detail: SECRET_PATH,
          },
        ],
      },
    },
    visual: null,
  };
  checkpoint.receipt = createEvidenceReceipt(checkpoint);
  return checkpoint;
}

test("minimum-disclosure capsule omits prompt, paths, and contract patterns by default", async () => {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(root, config.currentSessionId);
  const capsule = createDisclosureCapsule(checkpoint);
  const serialized = JSON.stringify(capsule);

  assert.equal(serialized.includes(SECRET_PROMPT), false);
  assert.equal(serialized.includes(SECRET_PATH), false);
  assert.equal(serialized.includes(SECRET_PATTERN), false);
  assert.equal(capsule.evidence.prompt.text, undefined);
  assert.equal(capsule.evidence.files, undefined);
  assert.equal(capsule.evidence.authorization.contract, undefined);
  assert.match(capsule.disclosureReceipt.receiptId, /^pod_[a-f0-9]{24}$/u);
  assert.equal(auditDisclosureCapsule(capsule).valid, true);
  assert.equal(verifyDisclosureCapsule(capsule).valid, true);
});

test("expanded disclosure is explicit and still receipt-verifiable", async () => {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(root, config.currentSessionId);
  const policy = createDisclosurePolicy({
    includePrompt: true,
    includePaths: true,
    includeContract: true,
  });
  const capsule = createDisclosureCapsule(checkpoint, policy);

  assert.equal(capsule.evidence.prompt.text, SECRET_PROMPT);
  assert.equal(capsule.evidence.files[0].path, SECRET_PATH);
  assert.equal(
    capsule.evidence.authorization.contract.allow[0],
    SECRET_PATTERN,
  );
  assert.equal(verifyDisclosureCapsule(capsule).valid, true);
});

test("disclosure drift and receipt tampering fail independently", async () => {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(root, config.currentSessionId);

  const drifted = createDisclosureCapsule(checkpoint);
  drifted.evidence.prompt.text = SECRET_PROMPT;
  const driftVerification = verifyDisclosureCapsule(drifted);
  assert.equal(driftVerification.valid, false);
  assert.equal(driftVerification.reason, "disclosure-drift");
  assert.deepEqual(driftVerification.audit.violations, [
    "prompt-text-disclosed",
  ]);

  const tampered = createDisclosureCapsule(checkpoint);
  tampered.evidence.effect.risk.score = 99;
  const tamperVerification = verifyDisclosureCapsule(tampered);
  assert.equal(tamperVerification.valid, false);
  assert.equal(tamperVerification.reason, "disclosure-receipt-mismatch");
  assert.equal(tamperVerification.audit.valid, true);
});

test("capsule CLI writes a minimum-disclosure artifact that can be verified standalone", async () => {
  const root = await createRepository();
  const { config } = await initializeStore(root);
  const checkpoint = checkpointFixture(root, config.currentSessionId);
  await saveCheckpoint(root, checkpoint);

  const stdout = memoryStream();
  assert.equal(
    await runCapsule([checkpoint.id, "--json"], {
      cwd: root,
      stdout,
      stderr: memoryStream(),
    }),
    0,
  );
  const result = JSON.parse(stdout.value());
  const bytes = await readFile(result.path, "utf8");
  assert.equal(bytes.includes(SECRET_PROMPT), false);
  assert.equal(bytes.includes(SECRET_PATH), false);
  assert.equal(bytes.includes(SECRET_PATTERN), false);

  const verifyOut = memoryStream();
  assert.equal(
    await runCapsule(["--verify", result.path, "--json"], {
      cwd: root,
      stdout: verifyOut,
      stderr: memoryStream(),
    }),
    0,
  );
  assert.equal(JSON.parse(verifyOut.value()).reason, "verified");
});
