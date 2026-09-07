import { runGit } from "./git.mjs";
import { ignoredEvidenceCoverage } from "./ignored.mjs";
import { createIndexSnapshot, createWorktreeSnapshot } from "./snapshot.mjs";

function parseNameStatus(output) {
  if (!output) return [];
  const tokens = output.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const rows = [];

  for (let index = 0; index < tokens.length; ) {
    let statusToken = tokens[index++];
    let firstPath = "";
    if (statusToken.includes("\t")) {
      const fields = statusToken.split("\t");
      statusToken = fields.shift();
      firstPath = fields.join("\t");
    } else {
      firstPath = tokens[index++] || "";
    }

    const code = statusToken.charAt(0);
    if (code === "R" || code === "C") {
      const newPath = tokens[index++] || "";
      rows.push({
        status: code === "R" ? "renamed" : "copied",
        path: newPath,
        oldPath: firstPath,
      });
    } else {
      const status =
        {
          A: "added",
          D: "deleted",
          M: "modified",
          T: "type-changed",
          U: "unmerged",
        }[code] || "modified";
      rows.push({ status, path: firstPath, oldPath: null });
    }
  }
  return rows;
}

function parseNumstat(output) {
  if (!output) return [];
  const tokens = output.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const rows = [];

  for (let index = 0; index < tokens.length; ) {
    const fields = (tokens[index++] || "").split("\t");
    const additionsRaw = fields.shift() || "0";
    const deletionsRaw = fields.shift() || "0";
    let path = fields.join("\t");
    let oldPath = null;

    if (path === "") {
      oldPath = tokens[index++] || null;
      path = tokens[index++] || oldPath || "";
    }

    const binary = additionsRaw === "-" || deletionsRaw === "-";
    rows.push({
      path,
      oldPath,
      additions: binary ? null : Number(additionsRaw),
      deletions: binary ? null : Number(deletionsRaw),
      binary,
    });
  }
  return rows;
}

export function parseDiffOutputs({ nameStatus = "", numstat = "" }) {
  const statuses = parseNameStatus(nameStatus);
  const stats = parseNumstat(numstat);
  const statsByPath = new Map(stats.map((row) => [row.path, row]));
  const statusByPath = new Map(statuses.map((row) => [row.path, row]));
  const paths = [...new Set([...statusByPath.keys(), ...statsByPath.keys()])];

  return paths.map((path) => ({
    path,
    oldPath:
      statusByPath.get(path)?.oldPath || statsByPath.get(path)?.oldPath || null,
    status: statusByPath.get(path)?.status || "modified",
    additions: statsByPath.get(path)?.additions ?? 0,
    deletions: statsByPath.get(path)?.deletions ?? 0,
    binary: statsByPath.get(path)?.binary || false,
  }));
}

export function collectCommitDiff(root, before, after) {
  const common = ["--find-renames", "--find-copies", before, after, "--"];
  const nameStatus = runGit(root, ["diff", "--name-status", "-z", ...common]);
  const numstat = runGit(root, ["diff", "--numstat", "-z", ...common]);
  const files = parseDiffOutputs({ nameStatus, numstat });
  Object.defineProperty(files, "evidenceCoverage", {
    value: ignoredEvidenceCoverage(root),
    enumerable: false,
  });
  return files;
}

export function collectPatch(root, before, after) {
  return runGit(root, [
    "diff",
    "--binary",
    "--find-renames",
    before,
    after,
    "--",
  ]);
}

export async function snapshotForScope(root, scope = "all") {
  const head = runGit(root, ["rev-parse", "HEAD"]).trim();
  if (scope === "staged") {
    const staged = createIndexSnapshot(root);
    return { before: head, after: staged.commit };
  }
  if (scope === "unstaged") {
    const staged = createIndexSnapshot(root);
    const current = await createWorktreeSnapshot(root, "unstaged working tree");
    return { before: staged.commit, after: current.commit };
  }
  if (scope !== "all") throw new Error(`Unknown diff scope: ${scope}`);
  const current = await createWorktreeSnapshot(
    root,
    "all working tree changes",
  );
  return { before: head, after: current.commit };
}
