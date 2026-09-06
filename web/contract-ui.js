const reportData = window.__PATCHOATH_REPORT__ || window.__VIBETRACE_REPORT__;
const checkpointId = document.getElementById("checkpointId");
const impactPanel = document.querySelector(".impact-panel");
const riskSection = document.querySelector(".risk-section");

if (!checkpointId || !impactPanel || !riskSection) {
  throw new Error(
    "PatchOath authorization UI could not find its host elements.",
  );
}

const demoAuthorization = {
  "204718_a91f3c": {
    authorization: {
      allow: ["src/ui/**", "src/styles/**"],
      deny: ["src/auth/**", "src/router/**"],
      protectedSurfaces: ["auth", "routing"],
      maxFiles: 3,
      maxLines: 80,
      maxModules: 2,
    },
    analysis: {
      contractCompliance: {
        declared: true,
        status: "violated",
        violations: [
          {
            detail:
              "Denied auth/router paths changed, protected surfaces were touched, and the declared budgets were exceeded.",
          },
        ],
      },
    },
    receipt: { receiptId: "poe_4f71a9c83e16d52a3f308cf0" },
  },
  "203229_8d0c42": {
    authorization: {
      allow: ["src/marketing/**", "src/styles/**"],
      deny: ["src/auth/**"],
      protectedSurfaces: ["auth", "dependencies"],
      maxFiles: 5,
      maxLines: 180,
      maxModules: 3,
    },
    analysis: {
      contractCompliance: {
        declared: true,
        status: "compliant",
        violations: [],
      },
    },
    receipt: { receiptId: "poe_16bbac216de20b8c011197d2" },
  },
  "201104_4b23a8": {
    authorization: null,
    analysis: {
      contractCompliance: {
        declared: false,
        status: "not-declared",
        violations: [],
      },
    },
    receipt: { receiptId: "poe_013e7f2c766593b63dc1d3ae" },
  },
};

const card = document.createElement("section");
card.className = "authorization-section";
card.setAttribute("aria-labelledby", "authorization-title");
riskSection.before(card);

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

function currentCheckpoint() {
  const displayed = displayedCheckpointKey();
  if (reportData?.checkpoints?.length) {
    return reportData.checkpoints.find(
      (checkpoint) => checkpoint.id.replace(/^(?:po|vt)_/u, "") === displayed,
    );
  }
  return demoAuthorization[displayed] || demoAuthorization["204718_a91f3c"];
}

function patterns(values, empty) {
  if (!values?.length)
    return `<span class="contract-empty">${escapeHtml(empty)}</span>`;
  return values
    .slice(0, 3)
    .map((value) => `<code>${escapeHtml(value)}</code>`)
    .join("");
}

function renderAuthorization() {
  const checkpoint = currentCheckpoint();
  const contract = checkpoint?.authorization;
  const compliance = checkpoint?.analysis?.contractCompliance;
  const receipt = checkpoint?.receipt;

  if (!contract || !compliance?.declared) {
    card.innerHTML = `
      <div class="authorization-heading">
        <div><p class="section-label">WHAT YOU AUTHORIZED</p><h2 id="authorization-title">Change contract</h2></div>
        <span class="contract-status undeclared">OPTIONAL</span>
      </div>
      <p class="contract-copy">No explicit execution boundary was declared for this checkpoint. Intent mismatch remains heuristic evidence only.</p>
      <div class="contract-hint"><span>+</span><code>--allow "src/ui/**" --deny "src/auth/**" --protect-surface auth --max-files 3</code></div>
      ${receipt?.receiptId ? `<button class="receipt-chip" type="button"><span>EVIDENCE RECEIPT</span><code>${escapeHtml(receipt.receiptId)}</code></button>` : ""}`;
    bindReceipt(receipt);
    return;
  }

  const violated = compliance.status === "violated";
  const limits = [
    contract.maxFiles === null || contract.maxFiles === undefined
      ? null
      : `${contract.maxFiles} files`,
    contract.maxLines === null || contract.maxLines === undefined
      ? null
      : `${contract.maxLines} lines`,
    contract.maxModules === null || contract.maxModules === undefined
      ? null
      : `${contract.maxModules} modules`,
  ].filter(Boolean);
  const violation = compliance.violations?.[0]?.detail;

  card.innerHTML = `
    <div class="authorization-heading">
      <div><p class="section-label">WHAT YOU AUTHORIZED</p><h2 id="authorization-title">Change contract</h2></div>
      <span class="contract-status ${violated ? "violated" : "compliant"}">${violated ? "DRIFT" : "ALIGNED"}</span>
    </div>
    <div class="contract-grid">
      <div><span>ALLOW PATHS</span>${patterns(contract.allow, "any path")}</div>
      <div><span>DENY PATHS</span>${patterns(contract.deny, "none")}</div>
      <div><span>PROTECTED SURFACES</span>${patterns(contract.protectedSurfaces, "none")}</div>
      <div><span>BUDGET</span><strong>${escapeHtml(limits.join(" · ") || "unbounded")}</strong></div>
    </div>
    <div class="contract-verdict ${violated ? "violated" : "compliant"}">
      <span>${violated ? "AUTHORIZATION DRIFT" : "AUTHORIZED SCOPE HELD"}</span>
      <strong>${escapeHtml(violation || "Observed files stayed inside the explicit Change Contract.")}</strong>
    </div>
    ${receipt?.receiptId ? `<button class="receipt-chip" type="button"><span>EVIDENCE RECEIPT</span><code>${escapeHtml(receipt.receiptId)}</code></button>` : ""}`;

  bindReceipt(receipt);
}

function bindReceipt(receipt) {
  const receiptButton = card.querySelector(".receipt-chip");
  if (!receiptButton || !receipt?.receiptId) return;
  receiptButton.title = "Copy evidence receipt";
  receiptButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(receipt.receiptId);
      receiptButton.classList.add("copied");
      setTimeout(() => receiptButton.classList.remove("copied"), 1200);
    } catch {
      receiptButton.title = receipt.receiptId;
    }
  });
}

function replaceQuickStartCopy() {
  const oldButton = document.getElementById("copyCommand");
  if (!oldButton) return;
  const replacement = oldButton.cloneNode(true);
  oldButton.replaceWith(replacement);
  replacement.addEventListener("click", async () => {
    const command =
      'patchoath checkpoint --prompt "Change the button color" --allow "src/components/**,src/styles/**" --deny "src/auth/**" --max-files 3';
    try {
      await navigator.clipboard.writeText(command);
      replacement.textContent = "Copied";
      setTimeout(() => (replacement.textContent = "Copy command"), 1200);
    } catch {
      replacement.title = command;
    }
  });
}

const observer = new MutationObserver(renderAuthorization);
observer.observe(checkpointId, {
  childList: true,
  characterData: true,
  subtree: true,
});
renderAuthorization();
replaceQuickStartCopy();
