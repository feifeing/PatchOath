import { execFileSync } from "node:child_process";
import {
  BRAND_NAME,
  LEGACY_REF_NAMESPACE,
  REF_NAMESPACE,
} from "../core/brand.mjs";

export class GitError extends Error {
  constructor(message, details = "") {
    super(message);
    this.name = "GitError";
    this.details = details;
  }
}

export function runGit(root, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
      env: { ...process.env, ...options.env },
    }).trimEnd();
  } catch (error) {
    const stderr = String(error.stderr || "").trim();
    throw new GitError(
      `Git command failed: git ${args.join(" ")}`,
      stderr || error.message,
    );
  }
}

export function findRepositoryRoot(cwd = process.cwd()) {
  try {
    return runGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new GitError(`${BRAND_NAME} must run inside a Git repository.`);
  }
}

export function repositoryMetadata(root) {
  let head;
  try {
    head = runGit(root, ["rev-parse", "--verify", "HEAD"]).trim();
  } catch {
    throw new GitError(
      `${BRAND_NAME} needs at least one Git commit before it can create a checkpoint.`,
      "Create an initial commit, then run the command again.",
    );
  }
  return {
    name:
      root.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ||
      "repository",
    branch: runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    head,
  };
}

export function inspectRepositoryAnchor(root, expected = {}) {
  const current = repositoryMetadata(root);
  const expectedAnchor = {
    branch: expected.branch || null,
    head: expected.head || null,
  };
  const currentAnchor = { branch: current.branch, head: current.head };
  const drift = [];

  if (expectedAnchor.head && currentAnchor.head !== expectedAnchor.head) {
    drift.push({
      field: "HEAD",
      expected: expectedAnchor.head,
      actual: currentAnchor.head,
    });
  }
  if (expectedAnchor.branch && currentAnchor.branch !== expectedAnchor.branch) {
    drift.push({
      field: "branch",
      expected: expectedAnchor.branch,
      actual: currentAnchor.branch,
    });
  }

  return {
    matches: drift.length === 0,
    expected: expectedAnchor,
    current: currentAnchor,
    drift,
  };
}

function anchorLabel(anchor) {
  const branch = anchor.branch || "unknown-branch";
  const head = anchor.head ? anchor.head.slice(0, 12) : "unknown-head";
  return `${branch} @ ${head}`;
}

export function assertRepositoryAnchor(
  root,
  expected,
  action = "continue this checkpoint",
) {
  const inspection = inspectRepositoryAnchor(root, expected);
  if (inspection.matches) return inspection;

  const fields = inspection.drift.map((item) => item.field).join(" and ");
  throw new GitError(
    `Repository ${fields} changed since the checkpoint started. PatchOath will not ${action} across repository history. Expected ${anchorLabel(inspection.expected)}; current ${anchorLabel(inspection.current)}. Return to the original repository anchor and retry, or abort the checkpoint.`,
  );
}

function currentRefNamespace(ref) {
  const legacyPrefix = `${LEGACY_REF_NAMESPACE}/checkpoints/po_`;
  if (ref.startsWith(legacyPrefix)) {
    return `${REF_NAMESPACE}${ref.slice(LEGACY_REF_NAMESPACE.length)}`;
  }
  return ref;
}

export function updateRef(root, ref, sha) {
  runGit(root, ["update-ref", currentRefNamespace(ref), sha]);
}

export function deleteRef(root, ref) {
  try {
    runGit(root, ["update-ref", "-d", currentRefNamespace(ref)]);
  } catch {
    // Deleting an absent cleanup ref is intentionally idempotent.
  }
}
