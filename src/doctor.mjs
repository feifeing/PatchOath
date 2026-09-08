import { lstat } from "node:fs/promises";
import { join } from "node:path";
import {
  LEGACY_STORE_DIRECTORY_NAME,
  STORE_DIRECTORY_NAME,
  checkpointRefCandidates,
} from "./core/brand.mjs";
import { verifyEvidenceReceipt } from "./core/receipt.mjs";
import {
  inspectStore,
  listCheckpoints,
  listSessions,
} from "./core/store.mjs";
import {
  findRepositoryRoot,
  repositoryMetadata,
  runGit,
} from "./git/git.mjs";

const HELP = `patchoath doctor [--json]\n\nAudit the local PatchOath trust graph without mutating repository evidence.\nChecks the evidence store, config/state/session/checkpoint relationships, Evidence Receipts, and Git snapshot refs.\n\nExit codes:\n  0  Audit completed with no failed integrity checks\n  1  Command/runtime error\n  2  Audit completed and found broken evidence invariants\n\nOptions:\n  --json     Emit machine-readable diagnostics\n  -h, --help Show help`;

const STATUS_ORDER = { pass: 0, warn: 1, fail: 2 };

function parse(argv) {
  const options = new Set();
  for (const token of argv) {
    if (["--json", "--help", "-h"].includes(token)) {
      options.add(token);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return { options };
}

async function lstatIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function diagnostic(id, status, message, details = undefined) {
  return {
    id,
    status,
    message,
    ...(details === undefined ? {} : { details }),
  };
}

function summarize(checks) {
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) summary[check.status] += 1;
  return summary;
}

function strongestStatus(checks) {
  let status = "pass";
  for (const check of checks) {
    if (STATUS_ORDER[check.status] > STATUS_ORDER[status]) status = check.status;
  }
  return status;
}

function gitObjectExists(root, commit) {
  try {
    runGit(root, ["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function inspectSnapshotRef(root, checkpoint, phase) {
  const commit = checkpoint[phase]?.commit;
  if (!commit) return null;
  const candidates = checkpointRefCandidates(checkpoint, phase);
  let found = false;
  let matched = false;
  for (const ref of candidates) {
    try {
      const actual = runGit(root, ["rev-parse", "--verify", ref]).trim();
      found = true;
      if (actual === commit) matched = true;
    } catch {
      // Missing compatibility candidate; another candidate may still bind the snapshot.
    }
  }
  return {
    checkpointId: checkpoint.id,
    phase,
    commit,
    objectExists: gitObjectExists(root, commit),
    refFound: found,
    refMatched: matched,
  };
}

async function inspectStoreSelection(root, checks) {
  const modern = await lstatIfPresent(join(root, STORE_DIRECTORY_NAME));
  const legacy = await lstatIfPresent(join(root, LEGACY_STORE_DIRECTORY_NAME));
  if (modern && legacy) {
    checks.push(
      diagnostic(
        "store.selection",
        "warn",
        `Both ${STORE_DIRECTORY_NAME}/ and ${LEGACY_STORE_DIRECTORY_NAME}/ exist; PatchOath prefers the modern store and leaves legacy evidence untouched.`,
      ),
    );
  } else {
    checks.push(
      diagnostic(
        "store.selection",
        "pass",
        modern
          ? `Using ${STORE_DIRECTORY_NAME}/.`
          : legacy
            ? `Using legacy compatibility store ${LEGACY_STORE_DIRECTORY_NAME}/.`
            : "No PatchOath evidence store exists yet.",
      ),
    );
  }
}

function inspectTrustGraph(store, sessions, checkpoints, checks) {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const checkpointById = new Map(
    checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
  );
  const graphIssues = [];

  const currentSession = sessionById.get(store.config.currentSessionId);
  if (!currentSession) {
    graphIssues.push(`current session ${store.config.currentSessionId} is missing`);
  }

  for (const session of sessions) {
    for (const checkpointId of session.checkpoints) {
      const checkpoint = checkpointById.get(checkpointId);
      if (!checkpoint) {
        graphIssues.push(
          `session ${session.id} references missing checkpoint ${checkpointId}`,
        );
        continue;
      }
      if (
        checkpoint.id.startsWith("po_") &&
        checkpoint.sessionId !== session.id
      ) {
        graphIssues.push(
          `checkpoint ${checkpoint.id} belongs to ${checkpoint.sessionId} but is indexed by ${session.id}`,
        );
      }
    }
  }

  for (const checkpoint of checkpoints) {
    if (!checkpoint.id.startsWith("po_")) continue;
    if (!checkpoint.sessionId.startsWith("session_")) {
      graphIssues.push(
        `modern checkpoint ${checkpoint.id} has non-storage session metadata ${checkpoint.sessionId}`,
      );
      continue;
    }
    const session = sessionById.get(checkpoint.sessionId);
    if (!session) {
      graphIssues.push(
        `checkpoint ${checkpoint.id} references missing session ${checkpoint.sessionId}`,
      );
      continue;
    }
    if (!session.checkpoints.includes(checkpoint.id)) {
      graphIssues.push(
        `checkpoint ${checkpoint.id} is not indexed by session ${session.id}`,
      );
    }
  }

  const activeId = store.state.activeCheckpointId;
  if (activeId) {
    const active = checkpointById.get(activeId);
    if (!active) {
      graphIssues.push(`active checkpoint ${activeId} is missing`);
    } else {
      if (active.status !== "recording") {
        graphIssues.push(
          `active checkpoint ${activeId} has status ${active.status}, not recording`,
        );
      }
      if (active.id.startsWith("po_") && active.sessionId !== store.config.currentSessionId) {
        graphIssues.push(
          `active checkpoint ${activeId} belongs to ${active.sessionId}, not current session ${store.config.currentSessionId}`,
        );
      }
    }
  }

  if (graphIssues.length === 0) {
    checks.push(
      diagnostic(
        "trust.graph",
        "pass",
        `${sessions.length} session(s) and ${checkpoints.length} checkpoint(s) form a consistent storage graph.`,
      ),
    );
  } else {
    checks.push(
      diagnostic(
        "trust.graph",
        "fail",
        `${graphIssues.length} trust-graph inconsistency(s) detected.`,
        graphIssues,
      ),
    );
  }
}

function inspectReceipts(checkpoints, checks) {
  const failures = [];
  let verified = 0;
  for (const checkpoint of checkpoints) {
    if (checkpoint.status !== "completed") continue;
    const result = verifyEvidenceReceipt(checkpoint);
    if (result.valid) {
      verified += 1;
    } else {
      failures.push(`${checkpoint.id}: ${result.reason}`);
    }
  }
  if (failures.length === 0) {
    checks.push(
      diagnostic(
        "receipts.integrity",
        "pass",
        `${verified} completed checkpoint receipt(s) recompute successfully.`,
      ),
    );
  } else {
    checks.push(
      diagnostic(
        "receipts.integrity",
        "fail",
        `${failures.length} completed checkpoint receipt(s) failed deterministic verification.`,
        failures,
      ),
    );
  }
}

function inspectGitSnapshots(root, checkpoints, checks) {
  const snapshots = [];
  for (const checkpoint of checkpoints) {
    for (const phase of ["before", "after"]) {
      const result = inspectSnapshotRef(root, checkpoint, phase);
      if (result) snapshots.push(result);
    }
  }

  const failures = [];
  for (const snapshot of snapshots) {
    if (!snapshot.objectExists) {
      failures.push(
        `${snapshot.checkpointId}/${snapshot.phase}: Git commit object is missing`,
      );
    } else if (!snapshot.refFound) {
      failures.push(
        `${snapshot.checkpointId}/${snapshot.phase}: no PatchOath compatibility ref exists`,
      );
    } else if (!snapshot.refMatched) {
      failures.push(
        `${snapshot.checkpointId}/${snapshot.phase}: stored ref does not resolve to the recorded commit`,
      );
    }
  }

  if (failures.length === 0) {
    checks.push(
      diagnostic(
        "git.snapshots",
        "pass",
        `${snapshots.length} recorded snapshot(s) retain both Git objects and matching refs.`,
      ),
    );
  } else {
    checks.push(
      diagnostic(
        "git.snapshots",
        "fail",
        `${failures.length} Git snapshot binding failure(s) detected.`,
        failures,
      ),
    );
  }
}

export async function diagnoseRepository(root) {
  const checks = [];
  const repository = repositoryMetadata(root);
  checks.push(
    diagnostic(
      "git.repository",
      "pass",
      `Repository ${repository.name} is on ${repository.branch} at ${repository.head.slice(0, 12)}.`,
    ),
  );
  await inspectStoreSelection(root, checks);

  let store;
  try {
    store = await inspectStore(root);
  } catch (error) {
    checks.push(
      diagnostic(
        "store.integrity",
        "fail",
        "The selected evidence store cannot be inspected safely.",
        [error.message],
      ),
    );
    const summary = summarize(checks);
    return {
      version: 1,
      status: strongestStatus(checks),
      healthy: false,
      repository,
      store: null,
      summary,
      checks,
    };
  }

  if (!store.exists) {
    checks.push(
      diagnostic(
        "store.integrity",
        "warn",
        `PatchOath is not initialized. Run "patchoath init" when you want to record evidence.`,
      ),
    );
    const summary = summarize(checks);
    return {
      version: 1,
      status: strongestStatus(checks),
      healthy: true,
      repository,
      store: { exists: false, directoryName: store.paths.directoryName },
      summary,
      checks,
    };
  }

  checks.push(
    diagnostic(
      "store.integrity",
      "pass",
      `${store.paths.directoryName}/ config and state passed managed-file and schema validation.`,
    ),
  );

  let sessions;
  let checkpoints;
  try {
    sessions = await listSessions(root);
    checks.push(
      diagnostic(
        "sessions.storage",
        "pass",
        `${sessions.length} session record(s) passed schema and storage-identity validation.`,
      ),
    );
  } catch (error) {
    checks.push(
      diagnostic(
        "sessions.storage",
        "fail",
        "Session evidence cannot be enumerated safely.",
        [error.message],
      ),
    );
  }

  try {
    checkpoints = await listCheckpoints(root);
    checks.push(
      diagnostic(
        "checkpoints.storage",
        "pass",
        `${checkpoints.length} checkpoint record(s) passed schema and storage-identity validation.`,
      ),
    );
  } catch (error) {
    checks.push(
      diagnostic(
        "checkpoints.storage",
        "fail",
        "Checkpoint evidence cannot be enumerated safely.",
        [error.message],
      ),
    );
  }

  if (sessions && checkpoints) {
    inspectTrustGraph(store, sessions, checkpoints, checks);
    inspectReceipts(checkpoints, checks);
    inspectGitSnapshots(root, checkpoints, checks);
  }

  const summary = summarize(checks);
  return {
    version: 1,
    status: strongestStatus(checks),
    healthy: summary.fail === 0,
    repository,
    store: {
      exists: true,
      directoryName: store.paths.directoryName,
      legacy: store.legacyStore,
      currentSessionId: store.config.currentSessionId,
      activeCheckpointId: store.state.activeCheckpointId,
    },
    summary,
    checks,
  };
}

function writeHuman(result, stdout) {
  stdout.write(`PatchOath doctor · ${result.repository.name}\n`);
  stdout.write(
    `repository ${result.repository.branch} @ ${result.repository.head.slice(0, 12)}\n`,
  );
  for (const check of result.checks) {
    stdout.write(`${check.status.toUpperCase().padEnd(4)} ${check.id} · ${check.message}\n`);
    for (const detail of check.details || []) {
      stdout.write(`     - ${detail}\n`);
    }
  }
  stdout.write(
    `summary ${result.summary.pass} pass · ${result.summary.warn} warn · ${result.summary.fail} fail\n`,
  );
}

export async function runDoctor(argv = process.argv.slice(3), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
  if (parsed.options.has("--help") || parsed.options.has("-h")) {
    stdout.write(`${HELP}\n`);
    return 0;
  }

  try {
    const root = findRepositoryRoot(io.cwd || process.cwd());
    const result = await diagnoseRepository(root);
    if (parsed.options.has("--json")) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      writeHuman(result, stdout);
    }
    return result.healthy ? 0 : 2;
  } catch (error) {
    stderr.write(`error ${error.message}\n`);
    return 1;
  }
}
