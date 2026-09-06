import { classifyFile, moduleForPath } from "./classify.mjs";

const RUNTIME_CONTRACT_ENV = "PATCHOATH_CHANGE_CONTRACT";
const LEGACY_RUNTIME_CONTRACT_ENV = "VIBETRACE_CHANGE_CONTRACT";
const PROTECTABLE_SURFACES = new Set([
  "ci",
  "dependencies",
  "auth",
  "database",
  "routing",
  "public-api",
  "global-styles",
  "config",
]);

function normalizePatterns(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeSurfaces(value) {
  const surfaces = normalizePatterns(value).map((item) => item.toLowerCase());
  const unknown = surfaces.filter(
    (surface) => !PROTECTABLE_SURFACES.has(surface),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown protected surface(s): ${unknown.join(", ")}. Supported surfaces: ${[...PROTECTABLE_SURFACES].join(", ")}.`,
    );
  }
  const selected = new Set(surfaces);
  return [...PROTECTABLE_SURFACES].filter((surface) => selected.has(surface));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}

function globToRegex(pattern) {
  const normalized = String(pattern).replaceAll("\\", "/");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char !== "*") {
      source += escapeRegex(char);
      continue;
    }
    if (normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else {
      source += "[^/]*";
    }
  }
  return new RegExp(`^${source}$`, "u");
}

function matchesAny(path, patterns) {
  if (patterns.length === 0) return false;
  const normalized = path.replaceAll("\\", "/");
  return patterns.some((pattern) => globToRegex(pattern).test(normalized));
}

function finiteLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("Change-contract limits must be non-negative integers.");
  }
  return number;
}

function modulesForFiles(files) {
  return new Set(
    files
      .map((file) => file.module || moduleForPath(file.path))
      .filter(Boolean),
  );
}

export function createChangeContract({
  allow = [],
  deny = [],
  protectedSurfaces = [],
  maxFiles = null,
  maxLines = null,
  maxModules = null,
} = {}) {
  const contract = {
    version: 1,
    mode: "explicit-user-authorization",
    allow: normalizePatterns(allow),
    deny: normalizePatterns(deny),
    protectedSurfaces: normalizeSurfaces(protectedSurfaces),
    maxFiles: finiteLimit(maxFiles),
    maxLines: finiteLimit(maxLines),
    maxModules: finiteLimit(maxModules),
  };
  const enabled =
    contract.allow.length > 0 ||
    contract.deny.length > 0 ||
    contract.protectedSurfaces.length > 0 ||
    contract.maxFiles !== null ||
    contract.maxLines !== null ||
    contract.maxModules !== null;
  return enabled ? contract : null;
}

export function setRuntimeChangeContract(contract) {
  if (!contract) {
    delete process.env[RUNTIME_CONTRACT_ENV];
    delete process.env[LEGACY_RUNTIME_CONTRACT_ENV];
    return;
  }
  process.env[RUNTIME_CONTRACT_ENV] = JSON.stringify(contract);
  delete process.env[LEGACY_RUNTIME_CONTRACT_ENV];
}

export function runtimeChangeContract() {
  const raw =
    process.env[RUNTIME_CONTRACT_ENV] ||
    process.env[LEGACY_RUNTIME_CONTRACT_ENV];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== 1 ||
      parsed.mode !== "explicit-user-authorization" ||
      !Array.isArray(parsed.allow) ||
      !Array.isArray(parsed.deny)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function evaluateChangeContract(contract, files = []) {
  const effectiveContract = contract || runtimeChangeContract();
  const modules = modulesForFiles(files);
  const lines = files.reduce(
    (sum, file) => sum + (file.additions || 0) + (file.deletions || 0),
    0,
  );
  if (!effectiveContract) {
    return {
      declared: false,
      status: "not-declared",
      violations: [],
      authorizedFiles: files.map((file) => file.path),
      unauthorizedFiles: [],
      protectedFiles: [],
      protectedSurfaceFiles: [],
      protectedSurfacesTouched: [],
      totals: {
        files: files.length,
        lines,
        modules: modules.size,
      },
    };
  }

  const violations = [];
  const unauthorizedFiles = [];
  const pathProtectedFiles = [];
  const protectedFiles = new Set();
  const protectedSurfaceFiles = new Set();
  const protectedSurfaceHits = new Map();
  const authorizedFiles = [];
  const allowIsRestrictive = effectiveContract.allow.length > 0;
  const protectedSurfaces = new Set(effectiveContract.protectedSurfaces || []);

  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    const denied = matchesAny(path, effectiveContract.deny);
    const allowed =
      !allowIsRestrictive || matchesAny(path, effectiveContract.allow);
    const signals = file.signals || classifyFile(path).signals;
    const matchedSurfaces = signals.filter((signal) =>
      protectedSurfaces.has(signal),
    );

    if (denied) {
      pathProtectedFiles.push(path);
      protectedFiles.add(path);
    }
    if (!allowed) unauthorizedFiles.push(path);
    if (matchedSurfaces.length > 0) {
      protectedFiles.add(path);
      protectedSurfaceFiles.add(path);
      for (const surface of matchedSurfaces) {
        if (!protectedSurfaceHits.has(surface))
          protectedSurfaceHits.set(surface, []);
        protectedSurfaceHits.get(surface).push(path);
      }
    }
    if (!denied && allowed && matchedSurfaces.length === 0)
      authorizedFiles.push(path);
  }

  if (pathProtectedFiles.length > 0) {
    violations.push({
      id: "protected-path-touched",
      detail: `${pathProtectedFiles.length} protected path(s) changed: ${pathProtectedFiles.join(", ")}`,
    });
  }
  const touchedSurfaces = [...PROTECTABLE_SURFACES].filter((surface) =>
    protectedSurfaceHits.has(surface),
  );
  if (touchedSurfaces.length > 0) {
    const detail = touchedSurfaces
      .map(
        (surface) =>
          `${surface}: ${protectedSurfaceHits.get(surface).slice().sort().join(", ")}`,
      )
      .join("; ");
    violations.push({
      id: "protected-surface-touched",
      detail: `${touchedSurfaces.length} protected surface(s) changed: ${detail}`,
    });
  }
  if (unauthorizedFiles.length > 0) {
    violations.push({
      id: "outside-authorized-scope",
      detail: `${unauthorizedFiles.length} file(s) fell outside the declared allow scope: ${unauthorizedFiles.join(", ")}`,
    });
  }

  if (
    effectiveContract.maxFiles !== null &&
    effectiveContract.maxFiles !== undefined &&
    files.length > effectiveContract.maxFiles
  ) {
    violations.push({
      id: "file-budget-exceeded",
      detail: `${files.length} files changed; contract allows at most ${effectiveContract.maxFiles}`,
    });
  }
  if (
    effectiveContract.maxLines !== null &&
    effectiveContract.maxLines !== undefined &&
    lines > effectiveContract.maxLines
  ) {
    violations.push({
      id: "line-budget-exceeded",
      detail: `${lines} lines changed; contract allows at most ${effectiveContract.maxLines}`,
    });
  }
  if (
    effectiveContract.maxModules !== null &&
    effectiveContract.maxModules !== undefined &&
    modules.size > effectiveContract.maxModules
  ) {
    violations.push({
      id: "module-budget-exceeded",
      detail: `${modules.size} modules changed; contract allows at most ${effectiveContract.maxModules}: ${[...modules].join(", ")}`,
    });
  }

  return {
    declared: true,
    status: violations.length === 0 ? "compliant" : "violated",
    violations,
    authorizedFiles,
    unauthorizedFiles,
    protectedFiles: [...protectedFiles].sort(),
    protectedSurfaceFiles: [...protectedSurfaceFiles].sort(),
    protectedSurfacesTouched: touchedSurfaces,
    totals: { files: files.length, lines, modules: modules.size },
  };
}

export const PROTECTED_SURFACES = [...PROTECTABLE_SURFACES];
