<p align="center">
  <img src="docs/patchoath-mark.svg" width="82" alt="PatchOath mark" />
</p>

<h1 align="center">PatchOath</h1>

<p align="center"><strong>Make every AI patch prove it stayed in scope.</strong></p>
<p align="center">Declare what an AI coding change may touch. Capture what it actually touched. Review the difference with evidence instead of guesswork.</p>

<p align="center">
  <a href="https://github.com/feifeing/vibetrace/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/feifeing/vibetrace/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-c8ff66.svg" /></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-9a7cff.svg" />
  <img alt="local first" src="https://img.shields.io/badge/evidence-local--first-11151a.svg" />
</p>

---

You ask a coding agent to change one button.

It edits twelve files, crosses into auth and routing, changes dependencies, and still produces a working page.

Git can show the diff. The harder question is:

> **Was the agent actually allowed to make that much change?**

PatchOath keeps five layers separate:

```text
Prompt intent
    ↓ context, not permission
Explicit authority
    ↓ Change Contract
Observed effect
    ↓ Git + optional visual evidence
Human review
    ↓ historical effect only
Disclosure
    ↓ minimum necessary evidence
```

That separation is the point. **Intent is not authority. Review is not future permission. A local report is not automatically safe to share.**

## 30-second workflow

Start a checkpoint before the agent edits:

```bash
patchoath checkpoint \
  --prompt "Change the primary button color" \
  --allow "src/components/**,src/styles/**" \
  --deny "src/auth/**,src/router/**" \
  --max-files 3 \
  --max-lines 80
```

Let the agent work, then inspect and finish:

```bash
patchoath diff
patchoath checkpoint --finish
patchoath verify
patchoath report --open
```

A result can look like:

```text
asked       Change the primary button color
allowed     components + styles · ≤3 files · ≤80 lines
observed    12 files · 6 modules · auth + routing touched
intent      mismatch detected
authority   contract violated
receipt     poe_… verified
review      human follow-up required
```

No language model is needed to decide that a file matching `src/auth/**` violated an explicit deny rule.

## What PatchOath adds to a normal diff

| Question                                                 | Evidence                                            |
| -------------------------------------------------------- | --------------------------------------------------- |
| What did I ask for?                                      | Prompt + transparent intent inference               |
| What was actually permitted?                             | Explicit Change Contract                            |
| What changed?                                            | Before/after Git objects + normalized file manifest |
| Did the patch cross the declared boundary?               | Authorization Drift                                 |
| Why is the change worth reviewing?                       | Explainable Blast Radius + risk factors             |
| Can the captured evidence still be checked?              | Versioned Evidence Receipt                          |
| Did a human accept this historical effect?               | Historical Effect Review Record                     |
| What can I share without dumping the whole local report? | Minimum-disclosure Evidence Capsule                 |

PatchOath is local-first, agent-agnostic, Git-compatible, and deliberately deterministic where a deterministic answer is possible.

## The design boundary

PatchOath does **not** claim that Git checkpoints, prompt histories, change-risk scoring, path allowlists, visual regression, blast-radius analysis, or review receipts are new ideas.

Its design focus is the narrower composition and separation of:

```text
inferred intent
      ≠
explicit execution authority
      ↓
recomputed observed effect
      ↓
evidence-bound contract drift
      ↓
historical human review
      ≠
future execution authority
      ↓
controlled disclosure
```

See [`docs/related-work.md`](docs/related-work.md) for the explicit prior-art and non-novelty boundary.

## Evidence Receipts

Completed checkpoints receive a deterministic SHA-256 Evidence Receipt. Current v2 receipts bind:

- prompt hash and source;
- explicit Change Contract;
- before/after Git object IDs;
- normalized file-level effect manifest;
- intent analysis;
- contract compliance;
- Blast Radius and risk analysis;
- available visual-analysis and artifact hashes.

Recompute it later:

```bash
patchoath verify
patchoath verify po_… --json
```

A verified receipt means the evidence currently available to PatchOath is internally consistent with the evidence bound into that receipt. It does **not** prove authorship, reviewer identity, semantic correctness, or machine trustworthiness.

Legacy v1 receipts remain verifiable with their narrower original coverage.

## Historical review is not new permission

Record a human conclusion about an already-observed change:

```bash
patchoath review --accept-effect --reviewer "Alice"
```

or:

```bash
patchoath review --needs-follow-up --note "Auth change needs a dedicated review"
```

The record is stored separately from the checkpoint and is bound to its source Evidence Receipt.

The following invariant is tested:

```text
accept-effect ≠ future authority
```

Creating a review record must not mutate the original Change Contract, Evidence Receipt, or checkpoint bytes.

Reviewer labels are claimed labels only; PatchOath does not pretend that entering a name authenticates identity.

## Minimum-disclosure evidence

A full local report may contain prompts, paths, contract patterns, screenshots, and other sensitive evidence. It should not be treated as a share-safe artifact by default.

Create a smaller Evidence Capsule instead:

```bash
patchoath capsule --json
```

The default policy omits:

- full prompt text;
- changed file paths;
- full contract patterns;
- Git patches;
- screenshot bytes.

Expanded disclosure requires explicit flags. Capsules carry a separate Disclosure Receipt and can be verified without loading the source checkpoint.

## Non-mutating Git snapshots

Checkpoint capture is designed not to move normal developer state. PatchOath:

1. creates a temporary Git index;
2. loads `HEAD` into it;
3. stages the current worktree into the temporary index;
4. writes a tree and local commit object;
5. deletes the temporary index; and
6. anchors completed evidence beneath private refs.

New evidence uses:

```text
refs/patchoath/checkpoints/<id>/before
refs/patchoath/checkpoints/<id>/after
```

The real Git index, branch, and `HEAD` are not moved by checkpoint capture.

## Optional visual evidence

With Playwright installed, a checkpoint can bind before/after page evidence:

```bash
npx playwright install chromium

patchoath checkpoint \
  --prompt "Refine the checkout summary" \
  --allow "src/checkout/**,src/styles/**" \
  --url http://localhost:3000

# agent edits; app reloads
patchoath checkpoint --finish
patchoath report --open
```

| Layer                | Current support                              |
| -------------------- | -------------------------------------------- |
| Screenshot bytes     | SHA-256 captured + re-hashed on verification |
| Pixel difference     | thresholded RGBA comparison                  |
| Layout movement      | basic visible-element movement / resize      |
| DOM change           | basic fingerprint + visible-node delta       |
| Semantic correctness | **not inferred**                             |

Visual output can vary with browser build, OS, fonts, and rendering hardware. Prefer like-for-like environments.

## Guarded restore

Restore is dry-run first and refuses to apply when later worktree drift is present:

```bash
patchoath restore
patchoath restore --apply
```

Applying restore changes the worktree to the checkpoint before-state while preserving `HEAD` and the real Git index.

## CLI

| Command                             | Purpose                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `patchoath init`                    | initialize local `.patchoath/` evidence state         |
| `patchoath checkpoint --prompt "…"` | begin a two-phase checkpoint                          |
| `patchoath checkpoint --finish`     | capture the after-state and bind evidence             |
| `patchoath checkpoint --abort`      | discard the active checkpoint                         |
| `patchoath diff [id]`               | inspect current or saved Blast Radius                 |
| `patchoath attest …`                | one-shot contract check for existing worktree changes |
| `patchoath verify [id]`             | recompute receipt and verify Git / visual evidence    |
| `patchoath contract-delta [id]`     | compute a restricted evidence-bound authority delta   |
| `patchoath review …`                | record or verify a historical human review            |
| `patchoath capsule …`               | create or verify minimum-disclosure evidence          |
| `patchoath replay`                  | replay the current session timeline                   |
| `patchoath report [id]`             | generate a standalone local review report             |
| `patchoath restore [id]`            | preview or safely apply a guarded restore             |

## Install from the repository

PatchOath remains intentionally `private: true` while the v0.3 migration and release gates are being completed, so there is no public npm-install claim yet.

For local development:

```bash
git clone https://github.com/feifeing/vibetrace.git
cd vibetrace
npm install
npm link

cd /path/to/your/project
patchoath init
```

The current GitHub repository slug is retained during the migration; product, package, CLI, state, and evidence namespaces are moving to PatchOath first so existing links do not break mid-change.

## Legacy compatibility

PatchOath v0.3 is designed to preserve evidence created by the earlier VibeTrace alpha.

New work writes:

```text
.patchoath/
refs/patchoath/…
po_…   poe_…   pocd_…   pod_…   por_…
```

Legacy evidence remains readable/verifiable from:

```text
.vibetrace/
refs/vibetrace/…
vt_…   vtr_…   vtcd_…   vtd_…   vrr_…
```

The old `vibetrace` executable is a temporary deprecated compatibility shim. New documentation and examples use `patchoath` only.

## Architecture

```text
src/core/        contracts · intent · receipts · review · disclosure
src/git/         snapshots · diff · restore · refs
src/visual/      optional Playwright capture and comparison
src/report/      standalone report derivation
web/             read-only Review / Disclosure dashboard
bin/patchoath    CLI entrypoint
```

Core trust rule:

> **Do not turn an inference into authority, a historical review into future permission, or a rich local report into implicit disclosure consent.**

## What PatchOath is not

PatchOath is not:

- an AI coding agent;
- a replacement for Git;
- an autonomous policy engine;
- an authorship or identity attestation system;
- a proof that changed code is semantically correct;
- an opaque probability-of-failure model.

Its scores are deterministic review heuristics with itemized reasons.

## Rights and release discipline

The repository includes an automated `rights:check` gate covering the reviewed dependency-license baseline, required notices, remote dashboard assets, bundled fonts, package privacy, and brand migration invariants.

See:

- [`LEGAL.md`](LEGAL.md)
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`docs/brand-clearance.md`](docs/brand-clearance.md)
- [`docs/asset-provenance.md`](docs/asset-provenance.md)
- [`docs/release-readiness.md`](docs/release-readiness.md)

Public name searches reduce collision risk but are not a substitute for formal trademark counsel before material commercial use.

## Philosophy

**Intent is context, not permission.**

**Declared boundaries outrank guesses.**

**Observed effects should be recomputable.**

**Review the historical patch without silently granting the next one.**

**Disclose the minimum evidence necessary.**

**Explainable before intelligent.**

## Status

PatchOath v0.3 is an actively hardened open-source alpha. Current automated validation covers Node 20/22, Chromium E2E, packaged CLI smoke tests on Ubuntu and Windows, formatting, and rights/release checks.

Contributions are welcome after reading [`CONTRIBUTING.md`](CONTRIBUTING.md).

MIT licensed. See [`LICENSE`](LICENSE).
