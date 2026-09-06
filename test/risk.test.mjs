import assert from "node:assert/strict";
import test from "node:test";
import { analyzeChangeSet } from "../src/core/risk.mjs";

test("a small visual prompt exposes sensitive intent mismatch", () => {
  const analysis = analyzeChangeSet({
    prompt: "Change the button color",
    files: [
      {
        path: "src/components/Button.tsx",
        additions: 4,
        deletions: 1,
        status: "modified",
      },
      {
        path: "src/styles/globals.css",
        additions: 12,
        deletions: 2,
        status: "modified",
      },
      {
        path: "src/router/index.ts",
        additions: 40,
        deletions: 20,
        status: "modified",
      },
      {
        path: "src/auth/session.ts",
        additions: 32,
        deletions: 8,
        status: "modified",
      },
      { path: "package.json", additions: 3, deletions: 1, status: "modified" },
    ],
  });

  assert.equal(analysis.intent.scale, "small");
  assert.equal(analysis.blastRadius.intentMismatch.detected, true);
  assert.deepEqual(
    new Set(analysis.blastRadius.intentMismatch.sensitiveUnexpected),
    new Set(["global-styles", "routing", "auth", "dependencies"]),
  );
  assert.ok(
    analysis.risk.factors.some((factor) => factor.id === "intent-mismatch"),
  );
  assert.equal(analysis.risk.model, "patchoath-evidence-risk-v2");
  assert.ok(analysis.blastRadius.score >= 50);
});

test("a contained copy edit stays low and does not invent risk", () => {
  const analysis = analyzeChangeSet({
    prompt: "Shorten the empty-state copy",
    files: [
      {
        path: "src/components/EmptyState.tsx",
        additions: 1,
        deletions: 1,
        status: "modified",
      },
    ],
  });

  assert.equal(analysis.summary.filesChanged, 1);
  assert.equal(analysis.blastRadius.intentMismatch.detected, false);
  assert.equal(analysis.risk.level, "low");
  assert.equal(analysis.risk.note.includes("not a probability"), true);
});

test("ordinary public assets are not misclassified as public APIs", () => {
  const analysis = analyzeChangeSet({
    prompt: "Replace the logo",
    files: [
      {
        path: "public/logo.svg",
        additions: 0,
        deletions: 0,
        binary: true,
        status: "modified",
      },
    ],
  });

  assert.equal(analysis.files[0].signals.includes("public-api"), false);
  assert.equal(
    analysis.blastRadius.sensitiveAreas.includes("public-api"),
    false,
  );
});
