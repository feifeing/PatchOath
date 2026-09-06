# PatchOath brand-clearance record

Recorded: **2026-09-04**

This document records the public naming screen used for the v0.3 project rename. It is an engineering/provenance record, not a legal opinion, trademark registration, or guarantee that no conflicting rights exist.

## Selected name

**PatchOath**

Primary positioning:

> **Make every AI patch prove it stayed in scope.**

The name maps directly to the product model:

- **Patch** — the code and visual effect actually produced by an AI-assisted change;
- **Oath** — the explicit human-declared boundary represented by a Change Contract; and
- **Proof** — Git objects, deterministic receipts, review records, and controlled-disclosure evidence used to check whether the observed effect stayed within that boundary.

`Oath` is a product metaphor for an explicit declared boundary. PatchOath does not claim that a Change Contract is a legal oath, cryptographic signature, identity credential, or guarantee of code correctness.

## Public-use screen

Before adopting the name, targeted exact-name searches were performed across publicly indexed sources and package/developer ecosystems, including:

- GitHub repository-name search;
- GitHub code search to distinguish exact brand use from substring matches;
- general web search for software products, companies, AI coding tools, security/developer tools, and commercial services;
- publicly indexed npm results;
- publicly indexed PyPI results;
- Product Hunt / product-launch results;
- public domain-use searches; and
- publicly indexed exact-name results associated with USPTO, WIPO, and EUIPO trademark sources.

At the time recorded above, those searches did **not identify an exact `PatchOath` software product, package, company, or clearly matching public trademark result**. GitHub repository-name search also returned no exact-name repository. GitHub code search results resembling the term were substring matches such as Android `PatchOatHeader` / `patchoat`, not an exact `PatchOath` product or identifier.

This is meaningful collision-reduction evidence, but it is not a substitute for a professional jurisdiction/class-specific trademark clearance search before significant commercialization.

## Why the previous working name was retired

The earlier working name **VibeTrace** had material public overlap before this repository adopted it as a long-term brand. The project's related-work and legal records document earlier exact or near-exact software/developer-tool uses, including an existing `vibetrace` npm package and multiple public projects/services using VibeTrace/Vibetrace naming.

The rename therefore reduces avoidable product-name confusion while preserving historical compatibility for previously generated local evidence.

## Candidates rejected during the same screen

The following candidates were deliberately not adopted because public searches found existing or adjacent uses, weak distinctiveness, or an undesirable collision surface:

| Candidate                     | Reason rejected                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| PromptLatch                   | Existing LLM/security tooling use                                                                            |
| DriftLatch                    | Existing commercial product use                                                                              |
| ScopeProof                    | Multiple active product/software uses                                                                        |
| ScopeLatch                    | Existing public software/type usage; weak uniqueness                                                         |
| PatchMandate / Mandate family | `patch mandate` is established security/compliance language and Mandate has adjacent agent-authorization use |
| Warrant family                | Existing AI-agent evidence/attestation product use and adjacent `Change Warrant` terminology                 |
| PatchSigil / Sigil family     | Existing Sigil software brand and weaker search distinctiveness                                              |
| PatchPact                     | Existing contract-first GitHub/developer project with close conceptual overlap                               |
| ScopePact                     | Existing agent authority/receipt product use                                                                 |
| PromptPact                    | Existing public name/application use                                                                         |

The purpose of this list is provenance and future naming discipline, not an allegation that any listed project owns a broad software concept.

## Compatibility policy

The new public product identity is PatchOath, but v0.3 intentionally keeps historical evidence usable and verifiable:

```text
fresh local store      .patchoath/
legacy local store     .vibetrace/        (in-place compatibility; no implicit move)

new Git refs           refs/patchoath/...
legacy Git refs        refs/vibetrace/... (verification compatibility)

new checkpoint IDs     po_...
new evidence IDs       poe_...
new delta IDs          pocd_...
new disclosure IDs     pod_...
new review IDs         por_...
```

If a repository already has `.vibetrace/`, PatchOath may continue using that physical store so the rename does not silently relocate or rewrite historical checkpoint data. New evidence created through PatchOath still uses the PatchOath ID and Git-ref namespaces. A fresh repository creates `.patchoath/`.

Legacy `vt_`, `vtr_`, `vtcd_`, `vtd_`, and `vrr_` evidence remains a compatibility concern and must not be silently invalidated merely to make the repository appear fully renamed.

The legacy `vibetrace` CLI name is retained only as a deprecated migration shim during the v0.3 compatibility window. New documentation and examples use `patchoath`.

## Release boundary

The package remains private during the migration and final technical audit. Making the npm package public, registering a trademark, purchasing domains, or relying on the name for significant commercial investment should remain explicit decisions rather than side effects of a code rename.

For commercial release, a qualified professional should perform a jurisdiction- and class-specific trademark clearance appropriate to the intended markets; patent/freedom-to-operate analysis is a separate question when commercially material. No statement in this repository should be read as a guarantee of non-infringement.
