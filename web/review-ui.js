const reportData = window.__PATCHOATH_REPORT__ || window.__VIBETRACE_REPORT__;
const checkpointId = document.getElementById("checkpointId");
const reviewPlane = document.getElementById("reviewPlane");

if (!checkpointId || !reviewPlane) {
  throw new Error("PatchOath review UI could not find its host elements.");
}

const demoV2Coverage = {
  evidenceVersion: 2,
  fileManifestBound: true,
  intentAnalysisBound: true,
  visualAnalysisBound: true,
  scope: "effect-manifest-v2",
};

const demoReview = {
  "204718_a91f3c": {
    sourceReceipt: {
      valid: true,
      reason: "verified",
      receiptId: "poe_4f71a9c83e16d52a3f308cf0",
      coverage: demoV2Coverage,
    },
    gitEffect: {
      recomputed: true,
      source: "recomputed-before-after-git-diff",
    },
    contractDelta: {
      status: "human-review-required",
      observed: { files: 12, lines: 418, modules: 6 },
      delta: {
        exactAllowAdditions: [
          {
            path: "package.json",
            representable: true,
            rationale: "exact-observed-path-only",
          },
        ],
        budgets: {
          maxFiles: { field: "maxFiles", from: 3, to: 12, increase: 9 },
          maxLines: { field: "maxLines", from: 80, to: 418, increase: 338 },
          maxModules: null,
        },
        protectedRelaxations: [],
      },
      blockers: [
        {
          id: "protected-path-requires-human-review",
          files: ["src/auth/session.ts", "src/router/index.ts"],
          proposedRelaxation: null,
        },
      ],
      counterfactual: { status: "violated", violations: [] },
      proposalReceipt: { receiptId: "pocd_61f8f51d7c04e45f437cd10a" },
      minimality: {
        model: "restricted-local-delta-v1",
        neverProposed: [
          "remove-deny",
          "unprotect-sensitive-surface",
          "broad-glob",
        ],
      },
    },
    disclosure: {
      status: "verified",
      reason: "verified",
      mode: "minimum-disclosure",
      omitted: [
        "contractPatterns",
        "filePaths",
        "gitPatch",
        "promptText",
        "visualArtifactBytes",
      ],
      receiptId: "pod_84cbf2ce83e3a0d174fd0391",
    },
  },
  "203229_8d0c42": {
    sourceReceipt: {
      valid: true,
      reason: "verified",
      receiptId: "poe_16bbac216de20b8c011197d2",
      coverage: demoV2Coverage,
    },
    gitEffect: {
      recomputed: true,
      source: "recomputed-before-after-git-diff",
    },
    contractDelta: {
      status: "already-compliant",
      observed: { files: 4, lines: 137, modules: 2 },
      delta: {
        exactAllowAdditions: [],
        budgets: { maxFiles: null, maxLines: null, maxModules: null },
        protectedRelaxations: [],
      },
      blockers: [],
      counterfactual: { status: "compliant", violations: [] },
      proposalReceipt: { receiptId: "pocd_40aa91a49c0f490490e4245d" },
      minimality: {
        model: "restricted-local-delta-v1",
        neverProposed: [
          "remove-deny",
          "unprotect-sensitive-surface",
          "broad-glob",
        ],
      },
    },
    disclosure: {
      status: "verified",
      reason: "verified",
      mode: "minimum-disclosure",
      omitted: [
        "contractPatterns",
        "filePaths",
        "gitPatch",
        "promptText",
        "visualArtifactBytes",
      ],
      receiptId: "pod_179550353527745ec866837d",
    },
  },
  "201104_4b23a8": {
    sourceReceipt: {
      valid: true,
      reason: "verified",
      receiptId: "poe_013e7f2c766593b63dc1d3ae",
      coverage: demoV2Coverage,
    },
    gitEffect: {
      recomputed: true,
      source: "recomputed-before-after-git-diff",
    },
    contractDelta: {
      status: "not-applicable",
      reason: "no-explicit-change-contract",
      note: "Without an explicit starting contract there is no authorization boundary to repair.",
    },
    disclosure: {
      status: "verified",
      reason: "verified",
      mode: "minimum-disclosure",
      omitted: [
        "contractPatterns",
        "filePaths",
        "gitPatch",
        "promptText",
        "visualArtifactBytes",
      ],
      receiptId: "pod_a9f229cc2acb8f9f12e32c70",
    },
  },
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}

function displayedCheckpointKey() {
  return checkpointId.textContent.trim().replace(/^#/u, "");
}

function checkpointDisplayKey(value) {
  return String(value || "").replace(/^(?:po|vt)_/u, "");
}

function currentCheckpoint() {
  const displayed = displayedCheckpointKey();
  if (reportData?.checkpoints?.length) {
    return reportData.checkpoints.find(
      (checkpoint) => checkpointDisplayKey(checkpoint.id) === displayed,
    );
  }
  return {
    id: `po_${displayed}`,
    review: demoReview[displayed] || demoReview["204718_a91f3c"],
  };
}

function reviewState(delta, sourceReceipt) {
  if (!sourceReceipt?.valid)
    return { label: "UNVERIFIED", className: "blocked" };
  if (!delta || delta.status === "unavailable")
    return { label: "UNAVAILABLE", className: "muted" };
  if (delta.status === "human-review-required")
    return { label: "HUMAN REVIEW", className: "blocked" };
  if (delta.status === "proposal-ready")
    return { label: "DELTA READY", className: "review" };
  if (delta.status === "already-compliant")
    return { label: "ALIGNED", className: "aligned" };
  if (delta.status === "not-applicable")
    return { label: "NO CONTRACT", className: "muted" };
  return { label: "REVIEW", className: "review" };
}

function budgetItems(delta) {
  if (!delta?.delta?.budgets) return [];
  return Object.values(delta.delta.budgets).filter(Boolean);
}

function exactGrantItems(delta) {
  return delta?.delta?.exactAllowAdditions || [];
}

function blockerItems(delta) {
  return delta?.blockers || [];
}

function renderDelta(delta) {
  if (!delta) {
    return '<p class="review-empty">Contract Delta is unavailable for this checkpoint.</p>';
  }
  if (delta.status === "unavailable") {
    const detail = delta.detail ? ` ${delta.detail}` : "";
    return `<p class="review-empty">Contract Delta was not derived: ${escapeHtml(delta.reason || "unavailable")}.${escapeHtml(detail)}</p>`;
  }
  if (delta.status === "not-applicable") {
    return `
      <p class="review-empty">${escapeHtml(delta.note || "No explicit Change Contract was declared, so there is no authorization boundary to repair.")}</p>
      <div class="review-rule"><span>BOUNDARY</span><strong>Declare a Change Contract before the edit to enable evidence-bound delta review.</strong></div>`;
  }

  const grants = exactGrantItems(delta);
  const budgets = budgetItems(delta);
  const blockers = blockerItems(delta);
  const observed = delta.observed || { files: 0, lines: 0, modules: 0 };

  const grantHtml = grants.length
    ? grants
        .map(
          (grant) =>
            `<li><span>ALLOW +</span><code>${escapeHtml(grant.path)}</code>${grant.representable === false ? "<em>cannot safely express</em>" : ""}</li>`,
        )
        .join("")
    : '<li class="quiet"><span>ALLOW +</span><strong>No path grant needed</strong></li>';
  const budgetHtml = budgets.length
    ? budgets
        .map(
          (budget) =>
            `<li><span>${escapeHtml(budget.field)}</span><strong>${escapeHtml(budget.from)} → ${escapeHtml(budget.to)}</strong></li>`,
        )
        .join("")
    : '<li class="quiet"><span>BUDGET</span><strong>No increase needed</strong></li>';
  const blockerHtml = blockers.length
    ? blockers
        .map((blocker) => {
          const detail = blocker.files?.length
            ? blocker.files.slice(0, 2).join(", ")
            : blocker.surfaces?.join(", ") || "manual decision required";
          return `<li class="blocker"><span>STOP</span><strong>${escapeHtml(blocker.id)}</strong><small>${escapeHtml(detail)}</small></li>`;
        })
        .join("")
    : '<li class="quiet"><span>STOP</span><strong>No protected-boundary blocker</strong></li>';

  return `
    <div class="review-metrics" aria-label="Recomputed observed effect">
      <div><span>FILES</span><strong>${escapeHtml(observed.files)}</strong></div>
      <div><span>LINES</span><strong>${escapeHtml(observed.lines)}</strong></div>
      <div><span>MODULES</span><strong>${escapeHtml(observed.modules)}</strong></div>
    </div>
    <div class="delta-columns">
      <div><p class="review-mini-label">NARROW MECHANICAL DELTA</p><ul class="review-list">${grantHtml}${budgetHtml}</ul></div>
      <div><p class="review-mini-label">NEVER AUTO-RELAX</p><ul class="review-list">${blockerHtml}</ul></div>
    </div>`;
}

function renderTrust(review) {
  const source = review?.sourceReceipt;
  const coverage = source?.coverage;
  const git = review?.gitEffect;
  const delta = review?.contractDelta;
  const replay = delta?.counterfactual?.status || "not-run";
  const proposalReceipt = delta?.proposalReceipt?.receiptId;

  const rows = [
    {
      label: "Source receipt",
      value: source?.valid ? "verified" : source?.reason || "unavailable",
      state: source?.valid ? "ok" : "bad",
    },
    {
      label: "Receipt coverage",
      value: coverage?.scope || "unknown",
      state: coverage?.fileManifestBound
        ? "ok"
        : coverage?.evidenceVersion === 1
          ? "warn"
          : "neutral",
    },
    {
      label: "Git effect",
      value: git?.recomputed ? "recomputed from objects" : "not recomputed",
      state: git?.recomputed ? "ok" : "bad",
    },
    {
      label: "Counterfactual replay",
      value: replay,
      state:
        replay === "compliant"
          ? "ok"
          : replay === "violated"
            ? "warn"
            : "neutral",
    },
    {
      label: "Auto privilege escalation",
      value: "disabled by design",
      state: "ok",
    },
  ];

  return `
    <div class="trust-chain">
      ${rows
        .map(
          (row) =>
            `<div><i class="${row.state}"></i><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`,
        )
        .join("")}
    </div>
    ${proposalReceipt ? `<button class="review-receipt" data-copy="${escapeHtml(proposalReceipt)}" type="button"><span>CONTRACT DELTA RECEIPT</span><code>${escapeHtml(proposalReceipt)}</code></button>` : ""}
    <p class="trust-boundary">Verification scope is explicit: this panel does not turn a proposal into approval, future authority, or a safety certificate.</p>`;
}

function renderDisclosure(checkpoint, review) {
  const disclosure = review?.disclosure;
  if (!disclosure || disclosure.status === "unavailable") {
    return `<p class="review-empty">Minimum-disclosure preview is unavailable: ${escapeHtml(disclosure?.reason || "source evidence was not verified")}.</p>`;
  }
  if (disclosure.status !== "verified") {
    return `<p class="review-empty">The Disclosure Capsule preview did not verify: ${escapeHtml(disclosure.reason || disclosure.status)}. Do not treat it as share-ready evidence.</p>`;
  }
  const omitted = disclosure.omitted || [];
  const receipt = disclosure.receiptId;
  const command = `patchoath capsule ${checkpoint.id || ""}`.trim();

  return `
    <div class="disclosure-warning">
      <span>LOCAL FULL EVIDENCE</span>
      <strong>This browser report is not a share-safe Capsule.</strong>
      <p>It can contain prompt text, paths, screenshots, and other checkpoint evidence. Generate a separate Capsule before external sharing.</p>
    </div>
    <p class="review-mini-label">MINIMUM DISCLOSURE OMITS</p>
    <div class="omission-cloud">
      ${omitted.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="review-command"><code>${escapeHtml(command)}</code><button data-copy="${escapeHtml(command)}" type="button">Copy</button></div>
    ${receipt ? `<button class="review-receipt disclosure-receipt" data-copy="${escapeHtml(receipt)}" type="button"><span>DISCLOSURE RECEIPT</span><code>${escapeHtml(receipt)}</code></button>` : ""}`;
}

async function copyValue(button) {
  const value = button.dataset.copy;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    const previous = button.dataset.label || button.textContent;
    button.dataset.label = previous;
    if (button.matches(".review-command button")) button.textContent = "Copied";
    else button.classList.add("copied");
    setTimeout(() => {
      if (button.matches(".review-command button"))
        button.textContent = previous;
      else button.classList.remove("copied");
    }, 1200);
  } catch {
    button.title = value;
  }
}

function bindCopies() {
  for (const button of reviewPlane.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", () => copyValue(button));
  }
}

function renderReviewPlane() {
  const checkpoint = currentCheckpoint();
  if (!checkpoint) return;
  const review = checkpoint.review || {};
  const delta = review.contractDelta;
  const state = reviewState(delta, review.sourceReceipt);
  const sourceReceiptId = review.sourceReceipt?.receiptId;

  reviewPlane.innerHTML = `
    <div class="review-plane-heading">
      <div>
        <p class="section-label">REVIEW CONTROL PLANE</p>
        <h2>Decide what to accept — and what to disclose.</h2>
        <p>Execution authority and evidence-sharing authority stay separate. Suggestions are evidence-bound; approval remains human.</p>
      </div>
      <div class="review-heading-meta">
        <span class="review-state ${state.className}">${state.label}</span>
        ${sourceReceiptId ? `<code>${escapeHtml(sourceReceiptId)}</code>` : ""}
      </div>
    </div>
    <div class="review-grid">
      <section class="review-card decision-card" aria-labelledby="decision-title">
        <div class="review-card-heading"><div><p class="section-label">04 · REVIEW</p><h3 id="decision-title">Observed-effect contract delta</h3></div><span>proposal only</span></div>
        ${renderDelta(delta)}
      </section>
      <section class="review-card trust-card" aria-labelledby="trust-title">
        <div class="review-card-heading"><div><p class="section-label">TRUST SCOPE</p><h3 id="trust-title">What was actually verified</h3></div><span>no hidden approval</span></div>
        ${renderTrust(review)}
      </section>
      <section class="review-card disclosure-card" aria-labelledby="disclosure-title">
        <div class="review-card-heading"><div><p class="section-label">05 · DISCLOSURE</p><h3 id="disclosure-title">Minimum-disclosure boundary</h3></div><span>${escapeHtml(review.disclosure?.status || "unavailable")}</span></div>
        ${renderDisclosure(checkpoint, review)}
      </section>
    </div>`;
  bindCopies();
}

const observer = new MutationObserver(renderReviewPlane);
observer.observe(checkpointId, {
  childList: true,
  characterData: true,
  subtree: true,
});
renderReviewPlane();
