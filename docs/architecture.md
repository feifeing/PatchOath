# PatchOath architecture

PatchOath v0.3 is a local CLI plus a standalone read-only review report. Its architecture is optimized around a narrow evidence chain rather than speculative agent integrations:

`Intent → Authority → Effect → Review → Disclosure`

## Core invariants

1. Snapshot capture must not move `HEAD`, replace the real Git index, stash files, or intentionally mutate the worktree.
2. Every risk point must map to an inspectable deterministic factor.
3. Prompt intent is heuristic context, never ground truth or permission.
4. Explicit user authority is separate from inferred intent. PatchOath must not infer permission merely because a prompt appears to imply it.
5. Observed effect must be grounded in before/after Git evidence rather than cached summaries when a stronger recomputation path is available.
6. Evidence Receipt coverage is versioned; old receipts remain verifiable under the narrower semantics that created them.
7. Historical human review describes an already-observed effect and must not mutate the Change Contract or grant future authority.
8. Disclosure authority is separate from execution authority. A rich local report is not automatically a share-safe artifact.
9. Pixel, layout, DOM, and semantic evidence are distinct layers; semantic correctness is not inferred from visual difference.
10. The browser report renders derived/stored evidence but does not silently rescore authorization policy.
11. Restore is dry-run by default and must refuse to overwrite post-checkpoint drift.
12. An applied restore must leave `HEAD` and the real Git index unchanged and verify that the resulting worktree is Git-equivalent to the recorded before-state.
13. Brand migration must not invalidate legacy evidence merely to obtain a clean namespace.

## Five-layer evidence model

PatchOath deliberately separates questions that are often collapsed into one generic AI-risk score.

### 1. Intent — what was asked?

`src/core/intent.mjs` conservatively infers likely domains and scale from a natural-language prompt. The inference is transparent and deterministic. It can support an **Intent Mismatch** signal, but it is not a permission system.

### 2. Authority — what was explicitly allowed?

`src/core/contract.mjs` represents an optional user-declared Change Contract. Current contracts can:

- allow path globs;
- deny path globs;
- protect deterministic repository surfaces;
- cap changed files;
- cap changed lines; and
- cap changed modules.

A contract is an execution boundary for one recorded change. It is not inferred from the prompt.

### 3. Effect — what actually happened?

Before/after Git objects, normalized file manifests, optional visual captures, and deterministic analysis represent observed effect. For completed checkpoints, review derivation prefers recomputing the Git effect from stored before/after objects instead of trusting a cached file list.

### 4. Review — what did a human conclude about that historical effect?

Historical Effect Review Records are stored separately from checkpoint JSON and are bound to the source Evidence Receipt. `accept-effect`, `reject-effect`, and `needs-follow-up` are retrospective dispositions only.

Invariant:

```text
accept-effect ≠ future authority
```

### 5. Disclosure — what evidence may leave the local environment?

`src/core/disclosure.mjs` builds a minimum-disclosure Evidence Capsule. The default capsule omits prompt text, file paths, full contract patterns, Git patches, and visual artifact bytes while retaining a cryptographic link to the source Evidence Receipt.

Execution authority and disclosure authority are deliberately independent.

## One-shot contract check

For an existing `HEAD → worktree` change, `patchoath attest` evaluates observed files against an explicit contract:

```bash
patchoath attest \
  --prompt "Change the button color" \
  --allow "src/components/**,src/styles/**" \
  --deny "src/auth/**,src/router/**" \
  --protect-surface "database,dependencies,ci" \
  --max-files 3 \
  --max-lines 80 \
  --max-modules 2
```

The command exits with status `2` when the declared contract is violated. This makes the result script-friendly without pretending to be an autonomous semantic policy engine.

## Evidence Receipts

`src/core/receipt.mjs` creates deterministic SHA-256 receipts over a versioned evidence envelope.

### Receipt v1

Legacy v1 receipts bind the original narrower evidence scope and remain verifiable for compatibility.

### Receipt v2

Current v2 receipts bind:

- prompt hash and source;
- explicit Change Contract, when present;
- repository `HEAD` plus before/after Git object IDs;
- normalized file-level effect manifest;
- intent analysis;
- contract-compliance result;
- Blast Radius and explainable risk;
- visual-analysis output; and
- available screenshot/DOM hashes.

New v0.3 receipts use a PatchOath namespace such as `poe_…`; legacy IDs retain their original form and are recomputed with their original rules.

A valid receipt proves a narrow property: the currently available evidence matches the deterministic envelope represented by that receipt. It is not an identity signature, provenance oracle, authorship proof, or semantic-correctness guarantee.

## Snapshot algorithm

For a before or after worktree snapshot, PatchOath:

1. creates a temporary Git index outside the repository;
2. loads `HEAD` into that index with `git read-tree`;
3. stages the current worktree into the temporary index with `git add -A`;
4. writes a tree and local commit object;
5. deletes the temporary index; and
6. anchors new evidence beneath `refs/patchoath/checkpoints/<id>/…`.

The repository's real index is not used for those writes. Ignored files remain ignored; tracked, staged, unstaged, deleted, renamed, and untracked non-ignored files are represented in the snapshot.

Legacy `refs/vibetrace/checkpoints/…` references remain verification candidates for old checkpoints; new checkpoints do not intentionally write that namespace.

## Local store migration

New projects use:

```text
.patchoath/
  config.json
  state.json
  checkpoints/
  sessions/
  artifacts/
  reports/
  reviews/
  capsules/
```

When a repository contains legacy `.vibetrace/` evidence and no PatchOath store yet, compatibility logic may read the legacy store rather than rewriting historical checkpoint bytes. Brand migration is not allowed to silently change a historical receipt merely to produce a new prefix.

## Diff normalization

`src/git/diff.mjs` compares Git objects using NUL-delimited name/status and numstat output. This preserves spaces, tabs, newlines, quoted characters, renames, binary files, and unusual paths.

A normalized file entry resembles:

```json
{
  "path": "src/components/Button.tsx",
  "oldPath": null,
  "status": "modified",
  "additions": 18,
  "deletions": 5,
  "binary": false
}
```

The same normalized model is used by checkpoint comparisons, contract evaluation, risk analysis, Contract Delta derivation, and evidence receipts.

## Checkpoint schema

A checkpoint contains:

- stable checkpoint/session identity;
- prompt text and source metadata;
- repository branch and `HEAD` at capture time;
- before/after Git object IDs and refs;
- normalized observed files and summary statistics;
- inferred intent;
- optional explicit authorization data;
- contract-compliance and authorization-drift evidence;
- Blast Radius and prompt-intent mismatch;
- explainable risk factors;
- optional visual capture/comparison layers; and
- a versioned Evidence Receipt for completed checkpoints.

Writes use temporary files plus atomic rename so an interrupted process does not intentionally leave half-written JSON.

## Contract Delta

`src/core/contract-delta.mjs` asks a deliberately restricted question after a completed change violates its contract:

> What smallest change can be proposed **within PatchOath's restricted proposal vocabulary** so that this already-observed effect would fit?

The current vocabulary can add exact observed file grants and raise budgets to observed totals. It deliberately does **not** propose:

- removing deny rules;
- unprotecting sensitive surfaces; or
- inventing broad globs from a single historical effect.

Contract Delta is a mechanical review aid, not approval. A counterfactual contract that would cover the historical effect does not grant an agent permission to perform it again.

## Risk and Blast Radius

Blast Radius answers “how far did the observed change spread?” Risk answers “what deserves review?” They share evidence but remain separate outputs.

Prompt-intent mismatch compares inferred expected signals and scale with observed signals/module spread. **Authorization Drift** is stronger because it compares observed effect with a user-declared boundary.

Sensitive classifications include CI, dependencies, auth, database, routing, public APIs, global styles, and configuration. Rules and weights live in importable modules with tests rather than an opaque model call.

## Historical Effect Review

Review records live outside checkpoint JSON. Before a new record is created, the source checkpoint must pass the relevant verification path. The record binds:

- checkpoint ID;
- source Evidence Receipt ID/version;
- disposition;
- timestamp;
- optional reviewer label/note; and
- explicit authority-effect invariants.

Reviewer labels are unverified labels. The current project does not claim identity authentication.

## Disclosure Capsule

The default disclosure policy is `minimum-disclosure`. A capsule can carry summaries, receipt links, contract counts/budgets, risk-factor IDs, and visual hashes without necessarily disclosing prompt text, source paths, contract patterns, patch bytes, or screenshot bytes.

The capsule has its own Disclosure Receipt. Verification checks both receipt integrity and disclosure-policy drift.

## Visual adapter

Playwright captures a fixed Chromium viewport with reduced motion/transitions for more stable comparison. `pngjs` supports basic absolute-RGBA comparison and a diff image. Captured PNGs receive SHA-256 hashes for evidence verification.

Layout evidence compares bounded visible-element rectangles by selector-like paths. DOM evidence compares a fingerprint and visible-node count. These are heuristics. PatchOath does not interpret semantic correctness.

## Read-only Review Plane

`src/report/` derives review evidence and emits a standalone report consumed by `web/`.

The Dashboard shows:

- prompt/intended scope context;
- explicit Change Contract;
- observed Git/visual effect;
- Contract Delta and counterfactual status;
- Historical Effect Review state;
- Evidence Receipt coverage; and
- minimum-disclosure Capsule preview.

The report is intentionally read-only. It does not create Accept/Reject records or mutate authority from a browser click.

## Guarded restore

`patchoath restore [checkpoint]` turns durable before/after evidence into a deliberately conservative rollback path.

Restore has two phases:

1. **Plan / dry run.** PatchOath snapshots the current worktree and compares it with the checkpoint after-state. It reports restore changes and later drift without mutation.
2. **Explicit apply.** Only `--apply` permits mutation. Immediately before writing, PatchOath repeats the drift check to narrow the plan/apply race window.

If either check detects drift, restore stops. There is no force flag, implicit stash, `git reset`, automatic merge, or silent deletion of later work.

When the guard passes, the restore layer uses a temporary Git index to transform the recorded after-state to the recorded before-state, then snapshots the result and requires Git-equivalent equality with the before object. It also verifies that the real `HEAD` and real index tree are unchanged.

Git clean/filter rules may materialize platform-specific worktree bytes, so verification proves Git-object equivalence after normal filters rather than universal cross-platform byte identity.

## Rights and release gates

`scripts/rights-check.mjs` is part of the engineering control plane. It checks the reviewed dependency-license baseline, required notices, package privacy, PatchOath package/CLI metadata, Dashboard remote assets, bundled fonts, brand-clearance records, and selected public-surface branding invariants.

This is not a legal opinion. It is a repeatable engineering mechanism designed to stop previously reviewed risks from silently reappearing during rapid iteration.

## Related-work boundary

AI change monitoring, prompt tracking, path allowlists, Git checkpointing, visual regression, blast-radius analysis, change-control authorization, review records, selective disclosure, and rollback workflows all have prior art. PatchOath does not claim those primitives as inventions.

Its technical focus is the **specific composition, separation, binding, and tested invariants** across inferred intent, explicit authority, recomputed effect, retrospective review, disclosure boundaries, and guarded restore.

See [`related-work.md`](related-work.md) for explicit non-novelty claims and differentiation boundaries.
