const reportData = window.__PATCHOATH_REPORT__ || window.__VIBETRACE_REPORT__;
const checkpointId = document.getElementById("checkpointId");
const reviewPlane = document.getElementById("reviewPlane");

if (!checkpointId || !reviewPlane) {
  throw new Error(
    "PatchOath historical review UI could not find its host elements.",
  );
}

const demoHistoricalReviews = {
  "204718_a91f3c": {
    status: "record-linked",
    count: 1,
    latest: {
      record: {
        recordId: "por_61d1ad8d769fa25cc28d829a",
        sourceReceiptId: "poe_4f71a9c83e16d52a3f308cf0",
        disposition: "needs-follow-up",
        recordedAt: "2026-09-03T15:18:00.000Z",
        note: "Auth and routing changes still require a security review.",
        reviewerLabel: "Maintainer A",
        authorityEffect: {
          scope: "historical-effect-only",
          mutatesChangeContract: false,
          grantsFutureAuthority: false,
          changesProtectedSurfaces: false,
        },
      },
      integrity: { valid: true, reason: "verified" },
    },
    sourceReceiptCurrent: { valid: true, reason: "verified" },
    reportVerificationScope: "record-integrity-plus-source-receipt",
    fullVerifyCommand: "patchoath review --verify por_61d1ad8d769fa25cc28d829a",
    authorityBoundary: {
      historicalEffectOnly: true,
      changeContractMutated: false,
      futureAuthorityGranted: false,
    },
  },
  "203229_8d0c42": {
    status: "record-linked",
    count: 1,
    latest: {
      record: {
        recordId: "por_4b72c436cdac2f91b702b975",
        sourceReceiptId: "poe_16bbac216de20b8c011197d2",
        disposition: "accept-effect",
        recordedAt: "2026-09-03T15:12:00.000Z",
        note: "Accepted for this captured effect only.",
        reviewerLabel: "Maintainer A",
        authorityEffect: {
          scope: "historical-effect-only",
          mutatesChangeContract: false,
          grantsFutureAuthority: false,
          changesProtectedSurfaces: false,
        },
      },
      integrity: { valid: true, reason: "verified" },
    },
    sourceReceiptCurrent: { valid: true, reason: "verified" },
    reportVerificationScope: "record-integrity-plus-source-receipt",
    fullVerifyCommand: "patchoath review --verify por_4b72c436cdac2f91b702b975",
    authorityBoundary: {
      historicalEffectOnly: true,
      changeContractMutated: false,
      futureAuthorityGranted: false,
    },
  },
  "201104_4b23a8": {
    status: "not-recorded",
    count: 0,
    latest: null,
    sourceReceiptCurrent: { valid: true, reason: "verified" },
    reportVerificationScope: "no-review-record",
    authorityBoundary: {
      historicalEffectOnly: true,
      changeContractMutated: false,
      futureAuthorityGranted: false,
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
    review: {
      historicalEffectReview:
        demoHistoricalReviews[displayed] ||
        demoHistoricalReviews["204718_a91f3c"],
    },
  };
}

function dispositionState(disposition) {
  if (disposition === "accept-effect") {
    return { label: "ACCEPTED EFFECT", className: "accepted" };
  }
  if (disposition === "reject-effect") {
    return { label: "REJECTED EFFECT", className: "rejected" };
  }
  if (disposition === "needs-follow-up") {
    return { label: "FOLLOW-UP", className: "follow-up" };
  }
  return { label: "UNREVIEWED", className: "unreviewed" };
}

function formatTime(value) {
  if (!value) return "unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function invariantRows(historical) {
  const boundary = historical?.authorityBoundary || {};
  return [
    ["Historical effect only", boundary.historicalEffectOnly === true],
    ["Change Contract unchanged", boundary.changeContractMutated === false],
    ["Future authority unchanged", boundary.futureAuthorityGranted === false],
  ]
    .map(
      ([label, valid]) =>
        `<span class="history-invariant ${valid ? "held" : "broken"}"><i></i>${escapeHtml(label)}</span>`,
    )
    .join("");
}

function renderNotRecorded(checkpoint, historical) {
  const command = `patchoath review ${checkpoint.id} --help`;
  return `
    <div class="history-empty">
      <span class="history-status unreviewed">UNREVIEWED</span>
      <div>
        <strong>No historical human review is recorded.</strong>
        <p>The mechanical Contract Delta above is still only a proposal. Record a retrospective outcome from the CLI if a human review is needed.</p>
      </div>
    </div>
    <div class="history-invariants">${invariantRows(historical)}</div>
    <div class="review-command history-command"><code>${escapeHtml(command)}</code><button data-history-copy="${escapeHtml(command)}" type="button">Copy</button></div>`;
}

function renderInvalid(historical) {
  const latest = historical?.latest;
  const recordId = latest?.record?.recordId || "unknown review record";
  const reason =
    latest?.integrity?.reason ||
    historical?.sourceReceiptCurrent?.reason ||
    "verification failed";
  return `
    <div class="history-empty invalid">
      <span class="history-status invalid">INVALID</span>
      <div>
        <strong>Do not rely on this historical review record.</strong>
        <p>${escapeHtml(recordId)} no longer links cleanly to the current evidence state: ${escapeHtml(reason)}.</p>
      </div>
    </div>
    <div class="history-invariants">${invariantRows(historical)}</div>`;
}

function renderLinked(historical) {
  const latest = historical.latest;
  const record = latest.record;
  const state = dispositionState(record.disposition);
  const reviewer = record.reviewerLabel || "not recorded";
  const note = record.note || "No local review note was recorded.";
  const command =
    historical.fullVerifyCommand ||
    `patchoath review --verify ${record.recordId}`;

  return `
    <div class="history-outcome">
      <div class="history-outcome-main">
        <span class="history-status ${state.className}">${state.label}</span>
        <strong>${escapeHtml(note)}</strong>
        <p>${escapeHtml(formatTime(record.recordedAt))} · ${escapeHtml(historical.count)} record${historical.count === 1 ? "" : "s"} for this checkpoint</p>
      </div>
      <dl class="history-meta">
        <div><dt>REVIEWER LABEL</dt><dd>${escapeHtml(reviewer)}<small>identity not verified</small></dd></div>
        <div><dt>RECORD</dt><dd><code>${escapeHtml(record.recordId)}</code></dd></div>
        <div><dt>REPORT CHECK</dt><dd>${latest.integrity?.valid && historical.sourceReceiptCurrent?.valid ? "record + source receipt linked" : "verification incomplete"}<small>run CLI verify for full source evidence</small></dd></div>
      </dl>
    </div>
    <div class="history-invariants">${invariantRows(historical)}</div>
    <div class="review-command history-command"><code>${escapeHtml(command)}</code><button data-history-copy="${escapeHtml(command)}" type="button">Copy</button></div>`;
}

async function copyValue(button) {
  const value = button.dataset.historyCopy;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    const previous = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  } catch {
    button.title = value;
  }
}

function renderHistoricalReview() {
  const checkpoint = currentCheckpoint();
  const grid = reviewPlane.querySelector(".review-grid");
  if (!checkpoint || !grid) return;

  const historical = checkpoint.review?.historicalEffectReview || {
    status: "not-recorded",
    count: 0,
    authorityBoundary: {
      historicalEffectOnly: true,
      changeContractMutated: false,
      futureAuthorityGranted: false,
    },
  };
  let body;
  if (historical.status === "invalid") body = renderInvalid(historical);
  else if (historical.status === "record-linked")
    body = renderLinked(historical);
  else body = renderNotRecorded(checkpoint, historical);

  const existing = grid.querySelector(".historical-review-card");
  if (existing) existing.remove();

  const section = document.createElement("section");
  section.className = "review-card historical-review-card";
  section.setAttribute("aria-labelledby", "historical-review-title");
  section.innerHTML = `
    <div class="review-card-heading">
      <div>
        <p class="section-label">04B · HUMAN REVIEW</p>
        <h3 id="historical-review-title">Historical effect review</h3>
      </div>
      <span>read-only evidence</span>
    </div>
    ${body}
    <p class="history-boundary">A recorded outcome describes this captured effect only. This browser report cannot create reviews, change the Change Contract, or grant an agent future authority.</p>`;
  grid.append(section);

  for (const button of section.querySelectorAll("[data-history-copy]")) {
    button.addEventListener("click", () => copyValue(button));
  }
}

let scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    renderHistoricalReview();
  });
}

const checkpointObserver = new MutationObserver(scheduleRender);
checkpointObserver.observe(checkpointId, {
  childList: true,
  characterData: true,
  subtree: true,
});

const reviewObserver = new MutationObserver(() => {
  if (!reviewPlane.querySelector(".historical-review-card")) scheduleRender();
});
reviewObserver.observe(reviewPlane, { childList: true, subtree: false });

scheduleRender();
