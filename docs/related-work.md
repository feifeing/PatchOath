# Related work and differentiation boundary

PatchOath is built in an active area with substantial prior art. This document records what the project **does not claim as novel**, important public overlap discovered during review, the reason the earlier working name was retired, and the narrower technical boundary the project is currently exploring.

Public availability dates below are provenance/context records, not legal priority rulings, trademark conclusions, or evidence that one project copied another.

## Not novelty claims

PatchOath does not claim to have invented any of the following ideas:

- AI coding checkpoints or rewind;
- Git diff or change-impact analysis;
- prompt / intent tracking or intent-mismatch warnings;
- path allowlists, protected-file rules, or executable change contracts;
- least-privilege authorization, step-up approval, permission deltas, or policy repair;
- blast-radius analysis;
- code-risk scoring;
- visual regression screenshots;
- developer timelines or session replay;
- evidence packs, audit receipts, cryptographic hashes, or signed attestations as general concepts;
- human approval logs or review receipts as general concepts; or
- selective disclosure, redaction policies, or privacy-preserving evidence projection.

Those ideas exist independently in Git tooling, access-control research, visual-regression systems, coding-agent products, CI policy tools, agent-security systems, and earlier vibe-coding projects.

## Why the earlier `VibeTrace` name was retired

The repository originally used **VibeTrace** as a working name. Public review found multiple earlier exact or near-exact software/developer-tool uses. That name is retained in this document only where necessary to describe those earlier public uses or the migration history.

### `MinSeok-log/vibetrace`

Repository: https://github.com/MinSeok-log/vibetrace

GitHub records this public repository as created on **2026-03-14**. Its published materials use the exact `vibetrace` name for an AI code-change monitor and describe functionality including diff tracking, risk scoring, affected-module analysis, intent-aware watching, an **Intent Mismatch Detected** warning, history, command guarding, and MCP integration. A public npm package named `vibetrace` also exists for this project line.

Consequences for PatchOath:

- the former exact package/product name was not treated as unique or commercially cleared;
- AI diff tracking, risk scoring, impact analysis, and intent-mismatch warnings are not PatchOath novelty claims; and
- implementation and documentation should remain independently authored rather than transplanting source or prose from that project.

### `zpeakj/vibe-trace`

Repository: https://github.com/zpeakj/vibe-trace

GitHub records this public repository as created on **2026-05-04**. It presents a `VibeTrace`-named VS Code-compatible tool for recording and visualizing vibe-coding process chains, including conversation/session timelines and file-impact records.

Consequences for PatchOath:

- session/timeline/file-impact visualization is not treated as a novel primitive; and
- the former exact/near-exact project name had additional earlier developer-tool use.

### itsavibe.ai TRACE

Specification: https://itsavibe.ai/trace

The TRACE specification records a **2026-05-07** `0.1-draft` and describes an agent incident-response/forensics workflow with a reference CLI named `vibetrace`. Its published surface includes local evidence bundles, replay, blast-radius queries, cryptographic sealing, and reports over agent activity.

Consequences for PatchOath:

- the combination of a `vibetrace` CLI name with agent evidence, replay, blast-radius, and local audit concepts is not treated as a first-use claim; and
- evidence bundles, replay, blast-radius analysis, hashing/sealing, and provider-agnostic local audit workflows remain prior-art areas rather than project inventions.

### Other exact-name software uses

Separate commercial software services also use `Vibetrace` / `VibeTrace`, including https://vibetrace.com/ and https://vibetrace.app/. Their product scopes differ from this repository, but their existence was another reason not to build a public-package/commercial brand around the former working name without formal clearance.

## What overlap does and does not mean

Functional or conceptual overlap does **not** by itself establish copyright infringement. Copyright generally protects particular expression such as source code, documentation, and artwork rather than the abstract idea of a diff tracker, risk score, timeline, or authorization boundary.

Conversely, an MIT or other open-source license is not permission to erase attribution/notice obligations or to claim another project's implementation as original. If PatchOath ever adopts third-party code, substantial text, assets, tests, or examples, the source and applicable license/permission must be handled explicitly.

Targeted source and phrase comparisons performed during the project's provenance review did not identify an obvious reason to treat the current implementation as a copied codebase. That is useful engineering evidence, but it is **not** a comprehensive proof of independent authorship, copyright non-infringement, trademark clearance, or freedom to operate.

## Current technical focus

PatchOath separates questions that are often collapsed into one agent-risk or trust score:

```text
Prompt intent
(heuristic context)
      ↓
Execution authority
(explicit Change Contract)
      ↓
Observed effect
(recomputable Git + optional visual evidence)
      ↓
Evidence integrity
(versioned deterministic receipt + verification)
      ↓
Mechanical review
(restricted evidence-bound Contract Delta)
      ↓
Historical human review
(separate record; no future authority)
      ↓
Disclosure authority
(explicit minimum-disclosure policy)
```

This produces distinct signals rather than a single opaque verdict:

- **intent mismatch** — the change is broader or qualitatively different from what transparent prompt rules inferred;
- **authorization drift** — the change violated an explicit user-declared execution boundary;
- **integrity mismatch** — captured evidence no longer recomputes to its recorded receipt;
- **review blocker** — a protected boundary cannot be mechanically relaxed from observed effect alone;
- **historical review outcome** — a human record about one already-captured effect, explicitly not future permission; and
- **disclosure drift** — a shareable Evidence Capsule contains a class of data its own Disclosure Policy says should be omitted.

Authorization Drift is intentionally treated as stronger evidence than prompt mismatch because it is based on a declared contract rather than an inferred interpretation of natural language.

The differentiation claim is therefore about the **specific implementation, binding, and semantic separation of these stages**, not ownership of their underlying general concepts.

## Evidence receipts and disclosure receipts

A completed checkpoint can have a versioned deterministic Evidence Receipt. Current v2 receipts bind prompt/authorization context, Git before/after objects, a normalized file-level effect manifest, relevant analysis, and available visual hashes. Legacy v1 receipts remain verifiable with their narrower coverage explicitly disclosed.

A minimum-disclosure Evidence Capsule separately binds its source receipt, Disclosure Policy, and exported projection. Historical review records separately bind a human disposition to a source Evidence Receipt while carrying an explicit `grantsFutureAuthority: false` invariant.

None of these mechanisms claims authorship, identity, semantic correctness, confidentiality, legal provenance, or non-repudiation. Cryptographic signatures and external trust anchors are separate mechanisms with substantial prior art and should remain separately named if introduced.

## Observed-effect contract delta

When a recorded effect violates a Change Contract, PatchOath can compute a restricted local contract delta for review. This is **not** a claim to invent permission deltas or access-control policy repair, and it is not a globally minimal policy solver.

The project deliberately constrains the proposal vocabulary to:

- exact observed file additions to an existing allow boundary; and
- numeric-budget increases only to the observed file/line/module totals.

It never proposes removing an explicit deny rule, unprotecting a sensitive surface, or generalizing one observed file into a broader glob. The same Git-derived observed effect is then replayed counterfactually against the candidate contract to determine whether that restricted proposal is sufficient.

The design question is narrower:

> Can previously captured AI-code-change evidence support a small, inspectable, non-self-applying authorization proposal while preserving a mandatory human decision for protected authority?

That is a project-specific workflow composition, not invention of least privilege itself.

## Why keep intent, authorization, review, and disclosure separate?

A prompt such as "clean up the checkout flow" is semantically broad. A user can still declare a precise execution boundary:

```text
allow: src/checkout/**
deny:  src/auth/**, migrations/**
max files: 8
max lines: 250
```

If the agent edits an auth module, PatchOath does not need to guess whether the prompt "really meant" auth. The evidence can state a simpler fact: the observed change crossed a declared boundary.

A later mechanical Contract Delta can answer a different question—what narrow candidate would cover this exact historical effect—without turning that answer into approval or future authority. A separate Historical Effect Review can record what a human decided about that captured effect without mutating the Change Contract.

Likewise, a complete local checkpoint may legitimately contain a confidential prompt or screenshot while a PR reviewer needs only structural evidence. A Disclosure Policy can make that sharing boundary explicit without pretending that hashes or redaction make the resulting artifact anonymous.

This makes the product less dependent on claiming that its prompt interpretation, permission model, review mechanism, or cryptographic primitives are uniquely intelligent or unprecedented.

## Naming and provenance review

The current **PatchOath** name is documented separately in [`brand-clearance.md`](brand-clearance.md). That preliminary collision scan reduces obvious naming risk relative to the former working name but is not a legal trademark opinion or guarantee of availability.

The repository also retains a deprecated `vibetrace` CLI shim and compatibility support for historical `.vibetrace/`, `refs/vibetrace/`, and legacy receipt IDs solely so the rename does not invalidate previously recorded evidence. Those compatibility strings should not be interpreted as continued branding.

## Ongoing review

The maintainers should update this document when a materially similar project, specification, patent, publication, or commercial product is discovered. If PatchOath adopts implementation ideas, code, assets, or text from third-party projects in the future, the relevant license, patent, attribution, and trademark requirements must be handled explicitly rather than hidden behind a generic "inspired by" statement.

Patent/freedom-to-operate conclusions are intentionally not recorded here as public legal opinions. Commercialization should use private, claim-focused professional review where appropriate.
