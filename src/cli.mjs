import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  BRAND_NAME,
  CLI_NAME,
  LEGACY_CHECKPOINT_ID_PREFIX,
  LEGACY_REF_NAMESPACE,
  REF_NAMESPACE,
  TAGLINE,
  VERSION,
  checkpointRef,
} from "./core/brand.mjs";
import { analyzeChangeSet } from "./core/risk.mjs";
import { createId } from "./core/id.mjs";
import { inferPromptIntent } from "./core/intent.mjs";
import {
  appendCheckpointToSession,
  createSession,
  deleteCheckpoint,
  initializeStore,
  listCheckpoints,
  loadCheckpoint,
  loadSession,
  loadStore,
  removeCheckpointFromSession,
  saveCheckpoint,
  saveState,
  storePaths,
} from "./core/store.mjs";
import {
  collectCommitDiff,
  collectPatch,
  snapshotForScope,
} from "./git/diff.mjs";
import {
  GitError,
  deleteRef,
  findRepositoryRoot,
  repositoryMetadata,
  updateRef,
} from "./git/git.mjs";
import { createWorktreeSnapshot } from "./git/snapshot.mjs";
import { generateReport } from "./report/generate.mjs";
import { capturePage } from "./visual/capture.mjs";
import { compareVisualCaptures } from "./visual/compare.mjs";

export { VERSION };

const HELP = `${BRAND_NAME} ${VERSION} — ${TAGLINE}

Usage:
  ${CLI_NAME} init
  ${CLI_NAME} checkpoint --prompt "Make the hero cinematic" [--url http://localhost:3000]
  ${CLI_NAME} checkpoint --finish
  ${CLI_NAME} checkpoint --prompt "Describe existing edits" --from-head
  ${CLI_NAME} diff [checkpoint] [--scope all|staged|unstaged] [--json] [--patch]
  ${CLI_NAME} replay [--json]
  ${CLI_NAME} session [new] [--name "Landing page pass"] [--json]
  ${CLI_NAME} report [checkpoint] [--open]

Checkpoint flow:
  1. Start a prompt-aware checkpoint before the AI edits.
  2. Run "${CLI_NAME} diff" at any time to inspect the live blast radius.
  3. Run "${CLI_NAME} checkpoint --finish" to save the after state and analysis.

Options:
  --prompt <text>       Prompt whose intent ${BRAND_NAME} should track
  --url <url>           Capture before/after screenshots with Playwright
  --viewport <WxH>      Screenshot viewport (default: 1440x900)
  --wait <ms>           Extra stabilization wait after page load
  --from-head           Capture existing worktree changes in one step
  --finish              Finish the active two-phase checkpoint
  --abort               Discard the active checkpoint metadata and refs
  --json                 Emit machine-readable JSON
  --patch                Include the unified Git patch after the summary
  --name <text>          Give a new session a readable name
  --open                 Open a generated report in the default browser
  --no-color             Disable ANSI color
  -h, --help             Show help
  -v, --version          Show version`;

const OPTION_DEFINITIONS = {
  "--prompt": "value",
  "--url": "value",
  "--viewport": "value",
  "--wait": "value",
  "--scope": "value",
  "--name": "value",
  "--finish": "boolean",
  "--abort": "boolean",
  "--from-head": "boolean",
  "--json": "boolean",
  "--patch": "boolean",
  "--open": "boolean",
  "--no-color": "boolean",
  "--help": "boolean",
  "-h": "boolean",
  "--version": "boolean",
  "-v": "boolean",
};

const COMMAND_OPTIONS = {
  init: [],
  checkpoint: [
    "--prompt",
    "--url",
    "--viewport",
    "--wait",
    "--finish",
    "--abort",
    "--from-head",
  ],
  diff: ["--scope", "--json", "--patch"],
  replay: ["--json"],
  session: ["--name", "--json"],
  report: ["--open"],
};

export function parseArguments(argv) {
  const command = argv[0]?.startsWith("-") ? undefined : argv[0];
  const tokens = command ? argv.slice(1) : argv;
  const options = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.split(/=(.*)/su, 2);
    const kind = OPTION_DEFINITIONS[rawName];
    if (!kind) throw new Error(`Unknown option: ${rawName}`);
    if (kind === "boolean") {
      if (inlineValue !== undefined)
        throw new Error(`${rawName} does not accept a value.`);
      options[rawName] = true;
      continue;
    }
    const value = inlineValue === undefined ? tokens[++index] : inlineValue;
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${rawName} requires a value.`);
    options[rawName] = value;
  }

  return { command, options, positionals };
}

function viewportFrom(value, fallback) {
  if (!value) return fallback;
  const match = /^(\d{3,4})x(\d{3,4})$/iu.exec(value);
  if (!match)
    throw new Error("Viewport must use WIDTHxHEIGHT, for example 1440x900.");
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width > 3840 || viewport.height > 3840)
    throw new Error("Viewport dimensions cannot exceed 3840.");
  return viewport;
}

function waitFrom(value, fallback) {
  if (value === undefined) return fallback;
  const waitMs = Number(value);
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10_000) {
    throw new Error("--wait must be an integer from 0 to 10000 milliseconds.");
  }
  return waitMs;
}

function createUi(stdout, stderr, colorEnabled) {
  const useColor =
    colorEnabled && Boolean(stdout.isTTY) && !process.env.NO_COLOR;
  const paint = (code, value) =>
    useColor ? `\u001b[${code}m${value}\u001b[0m` : String(value);
  return {
    line: (value = "") => stdout.write(`${value}\n`),
    error: (value) => stderr.write(`${paint("31", "error")} ${value}\n`),
    title: (value) => paint("1;38;5;141", value),
    dim: (value) => paint("2", value),
    good: (value) => paint("32", value),
    warn: (value) => paint("33", value),
    bad: (value) => paint("31", value),
    label: (value) => paint("38;5;110", value),
  };
}

function relativePath(root, path) {
  return isAbsolute(path)
    ? relative(root, path).replaceAll("\\", "/")
    : path.replaceAll("\\", "/");
}

function absolutePath(root, path) {
  return isAbsolute(path) ? path : join(root, path);
}

function portableCapture(root, capture) {
  return { ...capture, image: relativePath(root, capture.image) };
}

function hydratedCapture(root, capture) {
  return { ...capture, image: absolutePath(root, capture.image) };
}

function portableVisual(root, visual) {
  if (!visual) return null;
  const copy = structuredClone(visual);
  if (copy.pixel?.diffImage)
    copy.pixel.diffImage = relativePath(root, copy.pixel.diffImage);
  return copy;
}

function riskLabel(ui, level) {
  if (["critical", "high"].includes(level)) return ui.bad(level.toUpperCase());
  if (level === "medium") return ui.warn(level.toUpperCase());
  return ui.good(level.toUpperCase());
}

function printAnalysis(ui, analysis, checkpoint = null) {
  const summary = analysis.summary;
  ui.line("");
  if (checkpoint)
    ui.line(`${ui.title(`✦ ${BRAND_NAME}`)} ${ui.dim(checkpoint.id)}`);
  ui.line(
    `  ${ui.label("prompt")}  ${checkpoint?.prompt?.text || "Unspecified working-tree change"}`,
  );
  ui.line(
    `  ${ui.label("impact")}  ${summary.filesChanged} files · ${summary.linesChanged} lines · ${summary.modulesChanged} modules`,
  );
  ui.line(
    `  ${ui.label("blast")}   ${analysis.blastRadius.level.toUpperCase()} (${analysis.blastRadius.score}/100)`,
  );
  ui.line(
    `  ${ui.label("risk")}    ${riskLabel(ui, analysis.risk.level)} (${analysis.risk.score}/100)`,
  );

  if (analysis.blastRadius.intentMismatch.detected) {
    ui.line(
      `  ${ui.label("mismatch")} ${analysis.blastRadius.intentMismatch.explanation}`,
    );
  }

  ui.line("");
  ui.line(`  ${ui.label("WHY THE RISK SCORE MOVED")}`);
  if (analysis.risk.factors.length === 0)
    ui.line(`  ${ui.dim("No risk factors were triggered.")}`);
  for (const factor of analysis.risk.factors) {
    ui.line(
      `  +${String(factor.points).padStart(2)}  ${factor.label} — ${ui.dim(factor.detail)}`,
    );
  }

  if (analysis.files.length > 0) {
    ui.line("");
    ui.line(`  ${ui.label("CHANGE MAP")}`);
    for (const file of analysis.files) {
      const stat = file.binary
        ? "binary"
        : `+${file.additions} -${file.deletions}`;
      const rename = file.oldPath ? `${file.oldPath} → ` : "";
      ui.line(
        `  ${stat.padEnd(12)} ${rename}${file.path} ${ui.dim(`[${file.signals.join(", ")}]`)}`,
      );
    }
  }

  if (analysis.visual?.pixel?.supported) {
    ui.line("");
    ui.line(`  ${ui.label("VISUAL EVIDENCE")}`);
    ui.line(
      `  pixels       ${(analysis.visual.pixel.differenceRatio * 100).toFixed(2)}% changed (thresholded RGBA comparison)`,
    );
    ui.line(
      `  layout       ${analysis.visual.layout.movedOrResizedCount} moved/resized · ${analysis.visual.layout.addedCount} added · ${analysis.visual.layout.removedCount} removed`,
    );
    ui.line(
      `  DOM          ${analysis.visual.dom.changed ? "fingerprint changed" : "no fingerprint change"}`,
    );
    ui.line(`  semantics    ${ui.dim("not inferred")}`);
  }
  ui.line("");
}

async function resolveCheckpoint(
  root,
  token,
  { completedOnly = false, defaultSessionId = null } = {},
) {
  const checkpoints = await listCheckpoints(root);
  const eligible = completedOnly
    ? checkpoints.filter((checkpoint) => checkpoint.status === "completed")
    : checkpoints;
  if (!token) {
    const checkpoint = defaultSessionId
      ? eligible.find((candidate) => candidate.sessionId === defaultSessionId)
      : eligible[0];
    if (!checkpoint)
      throw new Error(
        completedOnly
          ? "No completed checkpoint exists yet."
          : "No checkpoint exists yet.",
      );
    return checkpoint;
  }
  const matches = eligible.filter(
    (checkpoint) => checkpoint.id === token || checkpoint.id.startsWith(token),
  );
  if (matches.length === 0)
    throw new Error(`Checkpoint ${token} was not found.`);
  if (matches.length > 1)
    throw new Error(`Checkpoint prefix ${token} is ambiguous.`);
  return matches[0];
}

async function captureBefore(root, checkpoint, options, config) {
  if (!options["--url"]) return checkpoint;
  const viewport = viewportFrom(options["--viewport"], config.visual.viewport);
  const waitMs = waitFrom(options["--wait"], config.visual.waitMs);
  const artifactDirectory = join(storePaths(root).artifacts, checkpoint.id);
  await mkdir(artifactDirectory, { recursive: true });
  const capture = await capturePage({
    url: options["--url"],
    outputPath: join(artifactDirectory, "before.png"),
    viewport,
    waitMs,
  });
  checkpoint.visual = {
    adapter: "playwright",
    url: options["--url"],
    viewport,
    waitMs,
    before: portableCapture(root, capture),
    layers: ["pixel", "layout", "dom"],
    semanticRegressionSupported: false,
  };
  return checkpoint;
}

async function finishVisual(root, checkpoint) {
  if (!checkpoint.visual?.before) return null;
  const artifactDirectory = join(storePaths(root).artifacts, checkpoint.id);
  const after = await capturePage({
    url: checkpoint.visual.url,
    outputPath: join(artifactDirectory, "after.png"),
    viewport: checkpoint.visual.viewport,
    waitMs: checkpoint.visual.waitMs,
  });
  const comparison = await compareVisualCaptures({
    before: hydratedCapture(root, checkpoint.visual.before),
    after,
    diffOutputPath: join(artifactDirectory, "diff.png"),
  });
  checkpoint.visual.after = portableCapture(root, after);
  return portableVisual(root, comparison);
}

function refNamespaceForCheckpointId(checkpointId) {
  return checkpointId.startsWith(`${LEGACY_CHECKPOINT_ID_PREFIX}_`)
    ? LEGACY_REF_NAMESPACE
    : REF_NAMESPACE;
}

function phaseRef(checkpointId, phase) {
  return checkpointRef(
    checkpointId,
    phase,
    refNamespaceForCheckpointId(checkpointId),
  );
}

async function startCheckpoint(root, prompt, options, ui) {
  const { config, state } = await loadStore(root);
  if (state.activeCheckpointId) {
    throw new Error(
      `Checkpoint ${state.activeCheckpointId} is still recording. Finish it with "${CLI_NAME} checkpoint --finish" or discard it with "--abort".`,
    );
  }
  if (!prompt?.trim())
    throw new Error(
      "Missing --prompt. Describe what you are asking the AI to change.",
    );
  if (options["--from-head"] && options["--url"]) {
    throw new Error(
      "--url cannot be combined with --from-head because the pre-change page is no longer running.",
    );
  }

  const id = createId();
  const beforeRef = phaseRef(id, "before");
  const afterRef = phaseRef(id, "after");
  const repository = repositoryMetadata(root);
  const now = new Date().toISOString();
  let beforeCommit;
  let afterSnapshot = null;

  if (options["--from-head"]) {
    beforeCommit = repository.head;
    afterSnapshot = await createWorktreeSnapshot(root, `${id} after`);
  } else {
    beforeCommit = (await createWorktreeSnapshot(root, `${id} before`)).commit;
  }
  updateRef(root, beforeRef, beforeCommit);

  let checkpoint = {
    schemaVersion: 2,
    id,
    sessionId: config.currentSessionId,
    status: options["--from-head"] ? "completed" : "recording",
    createdAt: now,
    completedAt: null,
    prompt: {
      text: prompt.trim(),
      source: "manual-cli",
      intent: inferPromptIntent(prompt),
    },
    repository,
    before: { commit: beforeCommit, ref: beforeRef, capturedAt: now },
    after: null,
    analysis: null,
    visual: null,
  };

  try {
    if (options["--from-head"]) {
      updateRef(root, afterRef, afterSnapshot.commit);
      const files = collectCommitDiff(root, beforeCommit, afterSnapshot.commit);
      if (files.length === 0) {
        deleteRef(root, beforeRef);
        deleteRef(root, afterRef);
        throw new Error(
          "No changes were detected between HEAD and the current worktree. No checkpoint was created.",
        );
      }
      checkpoint.after = {
        commit: afterSnapshot.commit,
        ref: afterRef,
        capturedAt: new Date().toISOString(),
      };
      checkpoint.completedAt = checkpoint.after.capturedAt;
      checkpoint.analysis = analyzeChangeSet({
        prompt: checkpoint.prompt.text,
        files,
      });
      await saveCheckpoint(root, checkpoint);
      await appendCheckpointToSession(
        root,
        checkpoint.sessionId,
        checkpoint.id,
      );
      printAnalysis(ui, checkpoint.analysis, checkpoint);
      ui.line(
        `${ui.good("saved")} ${relative(root, join(storePaths(root).checkpoints, `${id}.json`))}`,
      );
      return;
    }

    checkpoint = await captureBefore(root, checkpoint, options, config);
    await saveCheckpoint(root, checkpoint);
    await appendCheckpointToSession(root, checkpoint.sessionId, checkpoint.id);
    await saveState(root, {
      schemaVersion: 1,
      activeCheckpointId: checkpoint.id,
    });
  } catch (error) {
    deleteRef(root, beforeRef);
    await rm(join(storePaths(root).artifacts, id), {
      recursive: true,
      force: true,
    });
    throw error;
  }

  ui.line("");
  ui.line(`${ui.title("✦ Checkpoint recording")} ${ui.dim(id)}`);
  ui.line(`  ${ui.label("prompt")}  ${checkpoint.prompt.text}`);
  ui.line(
    `  ${ui.label("before")}  ${beforeCommit.slice(0, 10)} (persistent local Git ref)`,
  );
  if (checkpoint.visual)
    ui.line(
      `  ${ui.label("visual")}  captured ${checkpoint.visual.viewport.width}×${checkpoint.visual.viewport.height}`,
    );
  ui.line("");
  ui.line(
    `  Let the AI edit, inspect with ${ui.dim(`${CLI_NAME} diff`)}, then run:`,
  );
  ui.line(`  ${ui.title(`${CLI_NAME} checkpoint --finish`)}`);
  ui.line("");
}

async function finishCheckpoint(root, ui) {
  const { state } = await loadStore(root);
  if (!state.activeCheckpointId)
    throw new Error("There is no active checkpoint to finish.");
  const checkpoint = await loadCheckpoint(root, state.activeCheckpointId);
  const afterRef = phaseRef(checkpoint.id, "after");
  const afterSnapshot = await createWorktreeSnapshot(
    root,
    `${checkpoint.id} after`,
  );
  updateRef(root, afterRef, afterSnapshot.commit);
  const files = collectCommitDiff(
    root,
    checkpoint.before.commit,
    afterSnapshot.commit,
  );

  if (files.length === 0) {
    deleteRef(root, afterRef);
    throw new Error(
      "No code changes were detected. The checkpoint is still recording.",
    );
  }

  let visual = null;
  try {
    visual = await finishVisual(root, checkpoint);
  } catch (error) {
    deleteRef(root, afterRef);
    throw new Error(
      `The code snapshot is safe, but visual capture failed: ${error.message}`,
    );
  }

  checkpoint.status = "completed";
  checkpoint.completedAt = new Date().toISOString();
  checkpoint.after = {
    commit: afterSnapshot.commit,
    ref: afterRef,
    capturedAt: checkpoint.completedAt,
  };
  checkpoint.analysis = analyzeChangeSet({
    prompt: checkpoint.prompt.text,
    files,
    visual,
  });
  await saveCheckpoint(root, checkpoint);
  await saveState(root, { schemaVersion: 1, activeCheckpointId: null });
  printAnalysis(ui, checkpoint.analysis, checkpoint);
  ui.line(
    `${ui.good("saved")} ${relative(root, join(storePaths(root).checkpoints, `${checkpoint.id}.json`))}`,
  );
}

async function abortCheckpoint(root, ui) {
  const { state } = await loadStore(root);
  if (!state.activeCheckpointId)
    throw new Error("There is no active checkpoint to abort.");
  const checkpoint = await loadCheckpoint(root, state.activeCheckpointId);
  deleteRef(root, checkpoint.before.ref);
  if (checkpoint.after?.ref) deleteRef(root, checkpoint.after.ref);
  await deleteCheckpoint(root, checkpoint.id);
  await removeCheckpointFromSession(root, checkpoint.sessionId, checkpoint.id);
  await rm(join(storePaths(root).artifacts, checkpoint.id), {
    recursive: true,
    force: true,
  });
  await saveState(root, { schemaVersion: 1, activeCheckpointId: null });
  ui.line(`${ui.good("discarded")} ${checkpoint.id}`);
}

async function analysisForCheckpoint(root, checkpoint) {
  if (checkpoint.status === "completed") {
    return {
      analysis: checkpoint.analysis,
      before: checkpoint.before.commit,
      after: checkpoint.after.commit,
    };
  }
  const after = await createWorktreeSnapshot(
    root,
    `${checkpoint.id} live preview`,
  );
  const files = collectCommitDiff(root, checkpoint.before.commit, after.commit);
  return {
    analysis: analyzeChangeSet({ prompt: checkpoint.prompt.text, files }),
    before: checkpoint.before.commit,
    after: after.commit,
  };
}

async function commandDiff(root, parsed, ui) {
  const scope = parsed.options["--scope"];
  let checkpoint = null;
  let before;
  let after;
  let analysis;

  if (parsed.positionals[0] || !scope) {
    const store = await loadStore(root);
    if (parsed.positionals[0])
      checkpoint = await resolveCheckpoint(root, parsed.positionals[0]);
    else if (store.state.activeCheckpointId)
      checkpoint = await loadCheckpoint(root, store.state.activeCheckpointId);
    else {
      checkpoint = (await listCheckpoints(root)).find(
        (candidate) => candidate.sessionId === store.config.currentSessionId,
      );
    }
  }

  if (checkpoint) {
    if (scope && scope !== "all")
      throw new Error(
        "--scope staged|unstaged cannot be combined with a checkpoint.",
      );
    ({ analysis, before, after } = await analysisForCheckpoint(
      root,
      checkpoint,
    ));
  } else {
    const snapshot = await snapshotForScope(root, scope || "all");
    before = snapshot.before;
    after = snapshot.after;
    analysis = analyzeChangeSet({
      files: collectCommitDiff(root, before, after),
    });
  }

  if (parsed.options["--json"]) {
    ui.line(
      JSON.stringify(
        { checkpointId: checkpoint?.id || null, analysis },
        null,
        2,
      ),
    );
  } else {
    printAnalysis(ui, analysis, checkpoint);
  }
  if (parsed.options["--patch"]) {
    const patch = collectPatch(root, before, after);
    ui.line(
      patch ||
        ui.dim("No textual patch; the change may only contain binary files."),
    );
  }
}

async function commandReplay(root, parsed, ui) {
  const { config } = await loadStore(root);
  const checkpoints = (await listCheckpoints(root)).filter(
    (checkpoint) => checkpoint.sessionId === config.currentSessionId,
  );
  if (parsed.options["--json"]) {
    ui.line(JSON.stringify(checkpoints, null, 2));
    return;
  }
  if (checkpoints.length === 0) throw new Error("No checkpoints exist yet.");
  ui.line("");
  ui.line(ui.title("✦ Prompt timeline"));
  for (const checkpoint of checkpoints.slice().reverse()) {
    const time = checkpoint.createdAt.replace("T", " ").slice(0, 19);
    const status =
      checkpoint.status === "recording"
        ? ui.warn("RECORDING")
        : riskLabel(ui, checkpoint.analysis.risk.level);
    ui.line(
      `  ${ui.dim(time)}  ${status.padEnd(12)} ${checkpoint.prompt.text}`,
    );
    if (checkpoint.analysis) {
      ui.line(
        `                       ${ui.dim(`${checkpoint.analysis.summary.filesChanged} files · blast ${checkpoint.analysis.blastRadius.score} · ${checkpoint.id}`)}`,
      );
    } else {
      ui.line(`                       ${ui.dim(checkpoint.id)}`);
    }
  }
  ui.line("");
}

async function commandSession(root, parsed, ui) {
  const action = parsed.positionals[0] || "show";
  const { config, state } = await loadStore(root);

  if (action === "new") {
    if (state.activeCheckpointId) {
      throw new Error(
        `Finish or abort active checkpoint ${state.activeCheckpointId} before starting a new session.`,
      );
    }
    const session = await createSession(root, parsed.options["--name"]);
    if (parsed.options["--json"]) ui.line(JSON.stringify(session, null, 2));
    else {
      ui.line(`${ui.good("session")} ${session.name || "Untitled session"}`);
      ui.line(ui.dim(session.id));
    }
    return;
  }

  if (action !== "show") {
    throw new Error(
      `Unknown session action: ${action}. Use "${CLI_NAME} session" or "${CLI_NAME} session new".`,
    );
  }
  if (parsed.options["--name"] !== undefined) {
    throw new Error(`--name is only valid with "${CLI_NAME} session new".`);
  }
  const session = await loadSession(root, config.currentSessionId);
  if (parsed.options["--json"]) ui.line(JSON.stringify(session, null, 2));
  else {
    ui.line("");
    ui.line(ui.title(session.name || "Current session"));
    ui.line(`  ${ui.dim(session.id)}`);
    ui.line(
      `  ${session.checkpoints.length} checkpoint${session.checkpoints.length === 1 ? "" : "s"}`,
    );
    ui.line("");
  }
}

function openInBrowser(path) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", path] : [path];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function commandReport(root, parsed, ui) {
  const { config } = await loadStore(root);
  const selected = await resolveCheckpoint(root, parsed.positionals[0], {
    completedOnly: true,
    defaultSessionId: config.currentSessionId,
  });
  const checkpoints = (await listCheckpoints(root)).filter(
    (checkpoint) =>
      checkpoint.status === "completed" &&
      checkpoint.sessionId === selected.sessionId,
  );
  const report = await generateReport(root, checkpoints, selected.id);
  ui.line(`${ui.good("report")} ${report.relativeIndex}`);
  if (parsed.options["--open"]) {
    openInBrowser(report.index);
    ui.line(ui.dim("Opened in the default browser."));
  }
}

function ensureNoExtraPositionals(parsed, maximum) {
  if (parsed.positionals.length > maximum) {
    throw new Error(`Unexpected argument: ${parsed.positionals[maximum]}`);
  }
}

function validateCommandOptions(parsed) {
  const allowed = new Set([
    ...(COMMAND_OPTIONS[parsed.command] || []),
    "--no-color",
    "--help",
    "-h",
    "--version",
    "-v",
  ]);
  for (const name of Object.keys(parsed.options)) {
    if (!allowed.has(name))
      throw new Error(
        `${name} is not valid for the ${parsed.command} command.`,
      );
  }
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const ui = createUi(stdout, stderr, true);
    ui.error(error.message);
    return 2;
  }
  const ui = createUi(stdout, stderr, !parsed.options["--no-color"]);

  if (
    parsed.command === "version" ||
    parsed.options["--version"] ||
    parsed.options["-v"]
  ) {
    ui.line(VERSION);
    return 0;
  }
  if (
    !parsed.command ||
    parsed.command === "help" ||
    parsed.options["--help"] ||
    parsed.options["-h"]
  ) {
    ui.line(HELP);
    return 0;
  }

  try {
    validateCommandOptions(parsed);
    const root = findRepositoryRoot(io.cwd || process.cwd());
    if (parsed.command === "init") {
      ensureNoExtraPositionals(parsed, 0);
      const result = await initializeStore(root);
      const suffix = result.legacyStore ? " (legacy compatibility store)" : "";
      ui.line(
        result.created
          ? `${ui.good("initialized")} ${result.paths.directoryName}/${suffix} (kept local through .git/info/exclude)`
          : `${ui.good("ready")} ${BRAND_NAME} is already initialized in ${result.paths.directoryName}/${suffix}.`,
      );
      return 0;
    }
    if (parsed.command === "checkpoint") {
      ensureNoExtraPositionals(parsed, 0);
      if (
        [
          parsed.options["--finish"],
          parsed.options["--abort"],
          parsed.options["--from-head"],
        ].filter(Boolean).length > 1
      ) {
        throw new Error(
          "--finish, --abort, and --from-head are mutually exclusive.",
        );
      }
      if (
        (parsed.options["--finish"] || parsed.options["--abort"]) &&
        ["--prompt", "--url", "--viewport", "--wait"].some(
          (name) => parsed.options[name] !== undefined,
        )
      ) {
        throw new Error(
          "--finish and --abort do not accept prompt or capture options.",
        );
      }
      if (parsed.options["--abort"]) await abortCheckpoint(root, ui);
      else if (parsed.options["--finish"]) await finishCheckpoint(root, ui);
      else
        await startCheckpoint(
          root,
          parsed.options["--prompt"],
          parsed.options,
          ui,
        );
      return 0;
    }
    if (parsed.command === "diff") {
      ensureNoExtraPositionals(parsed, 1);
      await commandDiff(root, parsed, ui);
      return 0;
    }
    if (parsed.command === "replay") {
      ensureNoExtraPositionals(parsed, 0);
      await commandReplay(root, parsed, ui);
      return 0;
    }
    if (parsed.command === "session") {
      ensureNoExtraPositionals(parsed, 1);
      await commandSession(root, parsed, ui);
      return 0;
    }
    if (parsed.command === "report") {
      ensureNoExtraPositionals(parsed, 1);
      await commandReport(root, parsed, ui);
      return 0;
    }
    throw new Error(
      `Unknown command: ${parsed.command}. Run "${CLI_NAME} --help".`,
    );
  } catch (error) {
    ui.error(error.message);
    if (error instanceof GitError && error.details)
      ui.line(ui.dim(error.details));
    return 1;
  }
}
