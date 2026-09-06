const demoCheckpoints = [
  {
    schemaVersion: 2,
    id: "po_204718_a91f3c",
    status: "completed",
    createdAt: "2026-09-01T20:47:18.000Z",
    prompt: { text: "Change the primary button color to electric violet" },
    visual: {
      url: "http://localhost:3000",
      viewport: { width: 1440, height: 900 },
      demoVariant: "violet",
    },
    analysis: {
      summary: {
        filesChanged: 12,
        linesChanged: 418,
        modulesChanged: 6,
        additions: 301,
        deletions: 117,
      },
      blastRadius: {
        score: 92,
        level: "critical",
        modules: [
          "src/ui",
          "src/theme",
          "src/router",
          "src/auth",
          "config",
          "packages/tokens",
        ],
        sensitiveAreas: ["routing", "auth", "dependencies", "global-styles"],
        intentMismatch: {
          detected: true,
          explanation:
            "A color request crossed into routing, auth, dependencies, and six modules.",
          expectedSignals: ["styles", "ui"],
          unexpectedSignals: [
            "routing",
            "auth",
            "dependencies",
            "global-styles",
          ],
        },
      },
      risk: {
        score: 86,
        level: "critical",
        factors: [
          {
            label: "Prompt / change mismatch",
            points: 24,
            detail: "4 unexpected sensitive areas",
          },
          {
            label: "Sensitive areas",
            points: 22,
            detail: "routing, auth, dependencies",
          },
          {
            label: "Changed lines",
            points: 18,
            detail: "418 inserted or deleted lines",
          },
          {
            label: "Cross-module spread",
            points: 12,
            detail: "6 modules touched",
          },
          { label: "Files changed", points: 10, detail: "12 files changed" },
        ],
      },
      visual: {
        pixel: {
          supported: true,
          differenceRatio: 0.184,
          changedPixels: 238464,
          totalPixels: 1296000,
        },
        layout: {
          supported: true,
          movedOrResizedCount: 8,
          addedCount: 2,
          removedCount: 0,
        },
        dom: { supported: true, changed: true, nodeDelta: 6 },
        semantic: { supported: false },
      },
      files: [
        {
          path: "src/ui/Button.tsx",
          additions: 18,
          deletions: 5,
          signals: ["ui"],
          module: "src/ui",
        },
        {
          path: "src/styles/globals.css",
          additions: 61,
          deletions: 14,
          signals: ["global-styles", "styles"],
          module: "src/styles",
        },
        {
          path: "src/router/index.ts",
          additions: 37,
          deletions: 21,
          signals: ["routing"],
          module: "src/router",
        },
        {
          path: "src/auth/session.ts",
          additions: 42,
          deletions: 8,
          signals: ["auth"],
          module: "src/auth",
        },
        {
          path: "package.json",
          additions: 4,
          deletions: 2,
          signals: ["dependencies"],
          module: "(root)",
        },
      ],
    },
  },
  {
    schemaVersion: 2,
    id: "po_203229_8d0c42",
    status: "completed",
    createdAt: "2026-09-01T20:32:29.000Z",
    prompt: { text: "Make the hero section feel cinematic and premium" },
    visual: {
      url: "http://localhost:3000",
      viewport: { width: 1440, height: 900 },
      demoVariant: "cinematic",
    },
    analysis: {
      summary: {
        filesChanged: 4,
        linesChanged: 137,
        modulesChanged: 2,
        additions: 112,
        deletions: 25,
      },
      blastRadius: {
        score: 38,
        level: "moderate",
        modules: ["src/marketing", "src/styles"],
        sensitiveAreas: ["global-styles"],
        intentMismatch: {
          detected: false,
          explanation:
            "The observed change stays inside the inferred visual scope.",
          expectedSignals: ["ui", "styles"],
          unexpectedSignals: [],
        },
      },
      risk: {
        score: 36,
        level: "medium",
        factors: [
          {
            label: "Changed lines",
            points: 8,
            detail: "137 inserted or deleted lines",
          },
          {
            label: "Global styles",
            points: 7,
            detail: "Shared typography tokens changed",
          },
          {
            label: "Cross-module spread",
            points: 4,
            detail: "2 modules touched",
          },
          { label: "Files changed", points: 6, detail: "4 files changed" },
        ],
      },
      visual: {
        pixel: {
          supported: true,
          differenceRatio: 0.116,
          changedPixels: 150336,
          totalPixels: 1296000,
        },
        layout: {
          supported: true,
          movedOrResizedCount: 5,
          addedCount: 1,
          removedCount: 0,
        },
        dom: { supported: true, changed: true, nodeDelta: 2 },
        semantic: { supported: false },
      },
      files: [
        {
          path: "src/marketing/Hero.tsx",
          additions: 44,
          deletions: 11,
          signals: ["ui"],
          module: "src/marketing",
        },
        {
          path: "src/marketing/Glow.tsx",
          additions: 38,
          deletions: 0,
          signals: ["ui"],
          module: "src/marketing",
        },
        {
          path: "src/styles/hero.css",
          additions: 27,
          deletions: 9,
          signals: ["styles"],
          module: "src/styles",
        },
        {
          path: "src/styles/tokens.css",
          additions: 3,
          deletions: 5,
          signals: ["global-styles"],
          module: "src/styles",
        },
      ],
    },
  },
  {
    schemaVersion: 2,
    id: "po_201104_4b23a8",
    status: "completed",
    createdAt: "2026-09-01T20:11:04.000Z",
    prompt: { text: "Shorten the empty-state copy" },
    visual: {
      url: "http://localhost:3000",
      viewport: { width: 1440, height: 900 },
      demoVariant: "copy",
    },
    analysis: {
      summary: {
        filesChanged: 1,
        linesChanged: 2,
        modulesChanged: 1,
        additions: 1,
        deletions: 1,
      },
      blastRadius: {
        score: 4,
        level: "contained",
        modules: ["src/ui"],
        sensitiveAreas: [],
        intentMismatch: {
          detected: false,
          explanation: "One UI file changed, matching the requested copy edit.",
          expectedSignals: ["ui", "docs"],
          unexpectedSignals: [],
        },
      },
      risk: {
        score: 3,
        level: "low",
        factors: [
          { label: "Files changed", points: 3, detail: "1 file changed" },
        ],
      },
      visual: {
        pixel: {
          supported: true,
          differenceRatio: 0.008,
          changedPixels: 10368,
          totalPixels: 1296000,
        },
        layout: {
          supported: true,
          movedOrResizedCount: 0,
          addedCount: 0,
          removedCount: 0,
        },
        dom: { supported: true, changed: true, nodeDelta: 0 },
        semantic: { supported: false },
      },
      files: [
        {
          path: "src/ui/EmptyState.tsx",
          additions: 1,
          deletions: 1,
          signals: ["ui"],
          module: "src/ui",
        },
      ],
    },
  },
];

const report = window.__PATCHOATH_REPORT__ || window.__VIBETRACE_REPORT__;
const isReportMode = Boolean(report);
const checkpoints = report?.checkpoints?.length
  ? report.checkpoints
  : demoCheckpoints;
let selectedId = report?.selectedId || checkpoints[0]?.id;
let comparePosition = 52;
let visualMode = "wipe";

const ids = [
  "timeline",
  "checkpointCount",
  "evidenceTitle",
  "checkpointId",
  "copyId",
  "viewportText",
  "captureUrl",
  "captureState",
  "visualStage",
  "beforeFrame",
  "afterFrame",
  "diffFrame",
  "wipeLine",
  "compareSlider",
  "visualEvidence",
  "blastLevel",
  "blastScore",
  "blastSummary",
  "mismatch",
  "orbit",
  "riskScore",
  "riskLevel",
  "riskFactors",
  "fileCount",
  "fileList",
  "copyCommand",
  "toast",
];
const elements = Object.fromEntries(
  ids.map((id) => [
    id,
    document.getElementById(id === "evidenceTitle" ? "evidence-title" : id),
  ]),
);
for (const [name, element] of Object.entries(elements)) {
  if (!element)
    throw new Error(`Missing required PatchOath UI element: ${name}`);
}
const orbitPositions = [
  [50, 9],
  [82, 28],
  [78, 70],
  [50, 87],
  [19, 70],
  [14, 28],
  [50, 50],
];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}

function shortTime(date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

function levelClass(level) {
  if (["critical", "high", "wide"].includes(level)) return "high";
  if (["medium", "moderate"].includes(level)) return "medium";
  return "low";
}

function selectedCheckpoint() {
  return (
    checkpoints.find((checkpoint) => checkpoint.id === selectedId) ||
    checkpoints[0]
  );
}

function renderTimeline() {
  elements.checkpointCount.textContent = String(checkpoints.length).padStart(
    2,
    "0",
  );
  elements.timeline.innerHTML = checkpoints
    .map((checkpoint, index) => {
      const active = checkpoint.id === selectedId;
      const analysis = checkpoint.analysis;
      const risk = analysis?.risk || { level: "low", score: 0 };
      return `<button class="timeline-item ${active ? "active" : ""}" data-checkpoint="${escapeHtml(checkpoint.id)}" role="listitem" type="button" aria-pressed="${active}">
      <span class="timeline-node"><i></i><b>${String(checkpoints.length - index).padStart(2, "0")}</b></span>
      <span class="timeline-content">
        <span class="timeline-meta">${shortTime(checkpoint.createdAt)} <i>·</i> ${analysis?.summary?.filesChanged || 0} files</span>
        <strong>${escapeHtml(checkpoint.prompt.text)}</strong>
        <span class="timeline-result"><em class="${levelClass(risk.level)}">${escapeHtml(risk.level)}</em><b>blast ${analysis?.blastRadius?.score || 0}</b></span>
      </span>
    </button>`;
    })
    .join("");

  for (const button of elements.timeline.querySelectorAll(".timeline-item")) {
    button.addEventListener("click", () => {
      selectedId = button.dataset.checkpoint;
      render();
    });
  }
}

function demoShot(variant, state) {
  const after = state === "after";
  const copy = variant === "copy";
  const title = copy
    ? after
      ? "Nothing here yet."
      : "There are currently no items available in this workspace."
    : after
      ? variant === "violet"
        ? "Ship the idea."
        : "Build beyond ordinary."
      : "Build products faster.";
  const subtitle = copy
    ? after
      ? "Create your first checkpoint to begin."
      : "Once you have created an item, it will appear in this area for you to review."
    : after
      ? "From a fleeting prompt to an evidence-backed change."
      : "A calm workspace for focused teams.";
  return `<div class="demo-shot ${escapeHtml(variant)} ${state}">
    <nav><span class="demo-logo">NORTH/STAR</span><div><i></i><i></i><button>Open app</button></div></nav>
    <div class="demo-grid" aria-hidden="true"></div>
    <section><small>${after ? "THE NEW CREATIVE SYSTEM" : "DESIGN. BUILD. SHIP."}</small><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p><button>${copy ? "Create checkpoint" : after ? "Start building →" : "Explore platform"}</button></section>
    <div class="demo-orb"></div>
  </div>`;
}

function renderCapture(frame, image, variant, state) {
  if (image) {
    frame.innerHTML = `<img src="${escapeHtml(image)}" alt="${state === "before" ? "Before" : "After"} website capture" />`;
  } else if (!isReportMode || variant) {
    frame.innerHTML = demoShot(variant || "cinematic", state);
  } else {
    frame.innerHTML =
      '<div class="no-capture"><span>○</span><strong>No visual capture recorded</strong><small>Start the checkpoint with --url to attach Playwright evidence.</small></div>';
  }
}

function renderVisual(checkpoint) {
  const visual = checkpoint.visual || {};
  const comparison = checkpoint.analysis?.visual;
  const viewport = visual.viewport ||
    visual.before?.viewport || { width: 1440, height: 900 };
  elements.viewportText.textContent = `${viewport.width} × ${viewport.height}`;
  elements.captureUrl.textContent = (
    visual.url || "http://localhost:3000"
  ).replace(/^https?:\/\//u, "");
  const hasCapture = Boolean(visual.before?.image && visual.after?.image);
  elements.captureState.classList.toggle(
    "missing",
    isReportMode && !hasCapture,
  );
  elements.captureState.innerHTML = `<i></i> ${isReportMode && !hasCapture ? "not captured" : "captured"}`;
  renderCapture(
    elements.beforeFrame,
    visual.before?.image,
    visual.demoVariant,
    "before",
  );
  renderCapture(
    elements.afterFrame,
    visual.after?.image,
    visual.demoVariant,
    "after",
  );
  elements.diffFrame.innerHTML = comparison?.pixel?.diffImage
    ? `<img src="${escapeHtml(comparison.pixel.diffImage)}" alt="Thresholded pixel difference" />`
    : isReportMode
      ? '<div class="no-capture"><span>○</span><strong>No pixel diff recorded</strong><small>This checkpoint has no Playwright capture.</small></div>'
      : '<div class="demo-diff"><i></i><i></i><i></i><span>thresholded pixel delta</span></div>';
  elements.visualStage.dataset.view = visualMode;
  elements.afterFrame.style.clipPath = `inset(0 0 0 ${comparePosition}%)`;
  elements.wipeLine.style.left = `${comparePosition}%`;
  elements.compareSlider.value = comparePosition;

  const pixelRatio = comparison?.pixel?.differenceRatio;
  const evidence = [
    {
      label: "PIXEL DELTA",
      value: Number.isFinite(pixelRatio)
        ? `${(pixelRatio * 100).toFixed(1)}%`
        : "not captured",
      detail: Number.isFinite(pixelRatio)
        ? `${(comparison.pixel.changedPixels || 0).toLocaleString()} pixels`
        : "Playwright optional",
      active: Number.isFinite(pixelRatio),
    },
    {
      label: "LAYOUT SHIFT",
      value: comparison?.layout?.supported
        ? String(comparison.layout.movedOrResizedCount || 0)
        : "not captured",
      detail: comparison?.layout?.supported
        ? "elements moved / resized"
        : "No layout snapshot",
      active: comparison?.layout?.supported,
    },
    {
      label: "DOM CHANGE",
      value: comparison?.dom?.supported
        ? comparison.dom.changed
          ? "changed"
          : "stable"
        : "not captured",
      detail: comparison?.dom?.supported
        ? `${comparison.dom.nodeDelta >= 0 ? "+" : ""}${comparison.dom.nodeDelta || 0} visible nodes`
        : "No DOM fingerprint",
      active: comparison?.dom?.supported,
    },
    {
      label: "SEMANTIC RISK",
      value: "not inferred",
      detail: "Requires human review",
      active: false,
    },
  ];
  elements.visualEvidence.innerHTML = evidence
    .map(
      (item) =>
        `<div class="evidence-stat ${item.active ? "active" : ""}"><span>${item.label}</span><strong>${item.value}</strong><small>${item.detail}</small></div>`,
    )
    .join("");
}

function renderOrbit(modules, sensitiveAreas, files) {
  const visibleModules = modules.slice(0, 7);
  const lines = visibleModules
    .map((_, index) => {
      const [x, y] = orbitPositions[index];
      return `<line x1="50" y1="50" x2="${x}" y2="${y}" />`;
    })
    .join("");
  const nodes = visibleModules
    .map((module, index) => {
      const [x, y] = orbitPositions[index];
      const sensitive = files.some(
        (file) =>
          file.module === module &&
          file.signals?.some((signal) => sensitiveAreas.includes(signal)),
      );
      return `<span class="orbit-node ${sensitive ? "sensitive" : ""}" style="--x:${x}%;--y:${y}%"><i></i>${escapeHtml(module)}</span>`;
    })
    .join("");
  elements.orbit.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg><span class="orbit-core"><i></i>prompt</span>${nodes}`;
}

function renderImpact(checkpoint) {
  const analysis = checkpoint.analysis;
  const blast = analysis.blastRadius;
  const risk = analysis.risk;
  const mismatch = blast.intentMismatch;
  elements.blastLevel.className = `severity ${levelClass(blast.level)}`;
  elements.blastLevel.textContent = blast.level.toUpperCase();
  elements.blastScore.textContent = blast.score;
  elements.blastSummary.textContent = `${analysis.summary.filesChanged} files across ${analysis.summary.modulesChanged} modules`;
  elements.mismatch.className = `mismatch-card ${mismatch.detected ? "detected" : "aligned"}`;
  elements.mismatch.innerHTML = mismatch.detected
    ? `<span>INTENT MISMATCH</span><strong>${escapeHtml(mismatch.explanation)}</strong>`
    : `<span>SCOPE ALIGNED</span><strong>${escapeHtml(mismatch.explanation)}</strong>`;
  renderOrbit(blast.modules || [], blast.sensitiveAreas || [], analysis.files);
  elements.riskScore.textContent = risk.score;
  elements.riskLevel.textContent = risk.level.toUpperCase();
  elements.riskLevel.className = levelClass(risk.level);
  const maxFactor = Math.max(...risk.factors.map((factor) => factor.points), 1);
  elements.riskFactors.innerHTML = risk.factors
    .slice(0, 5)
    .map(
      (factor) =>
        `<div class="risk-factor" title="${escapeHtml(factor.detail || "")}"><div><span>${escapeHtml(factor.label)}</span><b>+${factor.points}</b></div><i><em style="width:${Math.max(7, (factor.points / maxFactor) * 100)}%"></em></i></div>`,
    )
    .join("");
  elements.fileCount.textContent = analysis.summary.filesChanged;
  const visibleFiles = analysis.files.slice(0, 6);
  const remainingFiles = Math.max(
    0,
    analysis.summary.filesChanged - visibleFiles.length,
  );
  elements.fileList.innerHTML = visibleFiles
    .map((file) => {
      const sensitive = file.signals?.some((signal) =>
        ["auth", "routing", "dependencies", "ci", "database"].includes(signal),
      );
      return `<div class="file-row"><span class="file-signal ${levelClass(sensitive ? "high" : "low")}"></span><code>${escapeHtml(file.path)}</code><span><b>+${file.additions ?? 0}</b><i>−${file.deletions ?? 0}</i></span></div>`;
    })
    .join("");
  if (remainingFiles > 0) {
    elements.fileList.insertAdjacentHTML(
      "beforeend",
      `<div class="file-more">+ ${remainingFiles} more file${remainingFiles === 1 ? "" : "s"}</div>`,
    );
  }
}

function render() {
  const checkpoint = selectedCheckpoint();
  if (!checkpoint) return;
  renderTimeline();
  elements.evidenceTitle.textContent = checkpoint.prompt.text;
  elements.checkpointId.textContent = checkpoint.id.replace(
    /^(?:po|vt)_/u,
    "#",
  );
  renderVisual(checkpoint);
  renderImpact(checkpoint);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(
    () => elements.toast.classList.remove("visible"),
    1800,
  );
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(message);
  } catch {
    showToast("Copy was blocked by the browser");
  }
}

elements.compareSlider.addEventListener("input", () => {
  comparePosition = Number(elements.compareSlider.value);
  elements.afterFrame.style.clipPath = `inset(0 0 0 ${comparePosition}%)`;
  elements.wipeLine.style.left = `${comparePosition}%`;
});

for (const button of document.querySelectorAll(".view-tab")) {
  button.addEventListener("click", () => {
    visualMode = button.dataset.view;
    for (const candidate of document.querySelectorAll(".view-tab"))
      candidate.classList.toggle("active", candidate === button);
    elements.visualStage.dataset.view = visualMode;
  });
}

elements.copyId.addEventListener("click", () =>
  copyText(selectedCheckpoint().id, "Checkpoint ID copied"),
);
elements.copyCommand.addEventListener("click", () =>
  copyText(
    'patchoath checkpoint --prompt "Make the hero cinematic" --url http://localhost:3000',
    "Command copied",
  ),
);

render();
