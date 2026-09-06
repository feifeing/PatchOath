import { classifyFile } from "./classify.mjs";
import { evaluateChangeContract } from "./contract.mjs";
import { inferPromptIntent } from "./intent.mjs";

const SENSITIVE_WEIGHTS = {
  ci: 12,
  dependencies: 12,
  auth: 16,
  database: 16,
  routing: 10,
  "public-api": 12,
  "global-styles": 7,
  config: 7,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function levelForRisk(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function levelForBlast(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "wide";
  if (score >= 25) return "moderate";
  return "contained";
}

function addFactor(factors, id, label, points, detail) {
  const rounded = Math.max(0, Math.round(points));
  if (rounded > 0) factors.push({ id, label, points: rounded, detail });
}

function enrichFiles(files) {
  return files.map((file) => {
    const classification = classifyFile(file.path);
    return { ...file, ...classification };
  });
}

function analyzeMismatch(intent, files, modules) {
  const actualSignals = new Set(files.flatMap((file) => file.signals));
  const expectedSignals = new Set(intent.expectedSignals);
  const sensitiveUnexpected = [...actualSignals].filter(
    (signal) => SENSITIVE_WEIGHTS[signal] && !expectedSignals.has(signal),
  );
  const unexpectedSignals = [...actualSignals].filter(
    (signal) =>
      !expectedSignals.has(signal) &&
      signal !== "code" &&
      signal !== "tests" &&
      signal !== "docs",
  );
  const excessFiles = Math.max(0, files.length - intent.expectedMaxFiles);
  const excessModules = Math.max(0, modules.size - intent.expectedMaxModules);
  const points = clamp(
    sensitiveUnexpected.length * 8 +
      unexpectedSignals.length * 3 +
      excessFiles * 2 +
      excessModules * 4,
    0,
    24,
  );

  const reasons = [];
  if (sensitiveUnexpected.length > 0)
    reasons.push(
      `unexpected sensitive areas: ${sensitiveUnexpected.join(", ")}`,
    );
  if (excessFiles > 0)
    reasons.push(
      `${excessFiles} file(s) beyond the inferred ${intent.scale} scope`,
    );
  if (excessModules > 0)
    reasons.push(`${excessModules} module(s) beyond the inferred scope`);

  return {
    detected: points > 0,
    points,
    expectedSignals: [...expectedSignals],
    actualSignals: [...actualSignals],
    unexpectedSignals,
    sensitiveUnexpected,
    excessFiles,
    excessModules,
    explanation:
      reasons.length > 0
        ? reasons.join("; ")
        : "The observed change stays within the prompt scope inferred by transparent rules.",
  };
}

export function analyzeChangeSet({
  prompt = "",
  files = [],
  visual = null,
  contract = null,
}) {
  const intent = inferPromptIntent(prompt);
  const enrichedFiles = enrichFiles(files);
  const modules = new Set(enrichedFiles.map((file) => file.module));
  const directories = new Set(enrichedFiles.map((file) => file.directory));
  const signals = new Set(enrichedFiles.flatMap((file) => file.signals));
  const linesChanged = enrichedFiles.reduce(
    (sum, file) => sum + (file.additions || 0) + (file.deletions || 0),
    0,
  );
  const binaryFiles = enrichedFiles.filter((file) => file.binary).length;
  const mismatch = analyzeMismatch(intent, enrichedFiles, modules);
  const contractCompliance = evaluateChangeContract(contract, enrichedFiles);

  let blastScore = 0;
  blastScore += clamp(enrichedFiles.length * 4, 0, 28);
  blastScore += clamp(Math.max(0, modules.size - 1) * 8, 0, 24);
  blastScore += clamp(Math.max(0, directories.size - 1) * 3, 0, 15);
  blastScore += clamp(mismatch.points, 0, 24);
  blastScore += clamp(
    contractCompliance.violations.length * 10 +
      contractCompliance.unauthorizedFiles.length * 4 +
      contractCompliance.protectedFiles.length * 6,
    0,
    28,
  );
  blastScore += clamp(
    [...signals].filter((signal) => SENSITIVE_WEIGHTS[signal]).length * 4,
    0,
    12,
  );
  blastScore = clamp(Math.round(blastScore), 0, 100);

  const factors = [];
  addFactor(
    factors,
    "file-count",
    "Files changed",
    clamp(Math.ceil(enrichedFiles.length / 2) * 3, 0, 18),
    `${enrichedFiles.length} file(s) changed`,
  );
  addFactor(
    factors,
    "line-churn",
    "Changed lines",
    clamp(Math.ceil(linesChanged / 50) * 2, 0, 18),
    `${linesChanged} inserted or deleted line(s)`,
  );
  addFactor(
    factors,
    "directory-spread",
    "Cross-directory spread",
    clamp(Math.max(0, directories.size - 1) * 3, 0, 12),
    `${directories.size} director${directories.size === 1 ? "y" : "ies"} touched`,
  );
  addFactor(
    factors,
    "module-spread",
    "Cross-module spread",
    clamp(Math.max(0, modules.size - 1) * 4, 0, 12),
    `${modules.size} module(s): ${[...modules].join(", ") || "none"}`,
  );

  const sensitiveSignals = [...signals].filter(
    (signal) => SENSITIVE_WEIGHTS[signal],
  );
  const sensitivePoints = clamp(
    sensitiveSignals.reduce(
      (sum, signal) => sum + SENSITIVE_WEIGHTS[signal],
      0,
    ),
    0,
    28,
  );
  addFactor(
    factors,
    "sensitive-areas",
    "Sensitive areas",
    sensitivePoints,
    sensitiveSignals.length > 0
      ? sensitiveSignals.join(", ")
      : "No sensitive areas detected",
  );
  addFactor(
    factors,
    "intent-mismatch",
    "Prompt / change mismatch",
    mismatch.points,
    mismatch.explanation,
  );

  if (contractCompliance.declared && contractCompliance.violations.length > 0) {
    addFactor(
      factors,
      "authorization-drift",
      "Declared change contract violated",
      clamp(
        contractCompliance.violations.length * 8 +
          contractCompliance.unauthorizedFiles.length * 3 +
          contractCompliance.protectedFiles.length * 5,
        8,
        28,
      ),
      contractCompliance.violations
        .map((violation) => violation.detail)
        .join("; "),
    );
  }

  if (enrichedFiles.length >= 15 || linesChanged >= 500) {
    addFactor(
      factors,
      "large-refactor",
      "Large refactor shape",
      12,
      `${enrichedFiles.length} files and ${linesChanged} changed lines resemble a broad refactor`,
    );
  }

  const visualRatio = visual?.pixel?.differenceRatio;
  const visualExpected = intent.expectedSignals.some((signal) =>
    ["styles", "ui"].includes(signal),
  );
  if (Number.isFinite(visualRatio) && visualRatio >= 0.12 && !visualExpected) {
    addFactor(
      factors,
      "unexpected-visual-change",
      "Unexpected visual movement",
      clamp(Math.round(visualRatio * 40), 4, 12),
      `${(visualRatio * 100).toFixed(1)}% of comparable pixels changed for a non-visual prompt`,
    );
  }

  const riskScore = clamp(
    factors.reduce((sum, factor) => sum + factor.points, 0),
    0,
    100,
  );

  return {
    intent,
    contractCompliance,
    summary: {
      filesChanged: enrichedFiles.length,
      linesChanged,
      additions: enrichedFiles.reduce(
        (sum, file) => sum + (file.additions || 0),
        0,
      ),
      deletions: enrichedFiles.reduce(
        (sum, file) => sum + (file.deletions || 0),
        0,
      ),
      modulesChanged: modules.size,
      directoriesChanged: directories.size,
      binaryFiles,
    },
    blastRadius: {
      score: blastScore,
      level: levelForBlast(blastScore),
      modules: [...modules],
      directories: [...directories],
      sensitiveAreas: sensitiveSignals,
      intentMismatch: mismatch,
      authorizationDrift:
        contractCompliance.declared && contractCompliance.status === "violated",
    },
    risk: {
      score: riskScore,
      level: levelForRisk(riskScore),
      model: "patchoath-evidence-risk-v2",
      factors: factors.sort((a, b) => b.points - a.points),
      note: "This is a deterministic review heuristic, not a probability of failure.",
    },
    files: enrichedFiles,
    visual,
  };
}
