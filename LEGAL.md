# Legal, privacy, and third-party boundaries

PatchOath is an open-source developer tool. This document records the project's current legal and privacy boundaries so implementation claims, release decisions, and community contributions remain conservative and inspectable.

This document is not legal advice and does not replace a jurisdiction-specific trademark, privacy, employment/IP, patent/freedom-to-operate, or open-source license review.

## Project name and trademarks

The project previously used the working name **VibeTrace**. A public-use scan recorded in September 2026 found multiple earlier exact or near-exact uses of `Vibetrace` / `VibeTrace` in software, including commercial software services, an existing public npm package named `vibetrace`, and earlier developer-tool projects in the AI-assisted-coding area. The project therefore stopped treating that name as suitable for an unreviewed package or commercial launch.

The current working product name is **PatchOath**. It was selected only after a preliminary public collision scan found materially fewer obvious same-name conflicts in software/package ecosystems than the discarded candidates. That engineering scan is recorded in [`docs/brand-clearance.md`](docs/brand-clearance.md).

Neither the scan nor this rename means that:

- a trademark registration has been obtained;
- the mark is exclusive or legally cleared in every jurisdiction;
- no unindexed, pending, common-law, regional, or confusingly similar rights exist; or
- a future commercial use could not require additional review.

Before a public package release, paid offering, company formation, or substantial marketing spend under PatchOath or any later product name, maintainers should complete a documented naming/trademark clearance review appropriate to the intended jurisdictions and goods/services, including materially similar names in actual use, relevant trademark registries, package registries, domains, source-hosting platforms, app stores, and developer communities.

The npm package therefore remains `private: true` during the migration and final release review. A code rename is not itself an instruction to publish.

Names and marks of third-party products or companies mentioned in documentation are used only to describe compatibility, comparison, prior work, migration history, or ecosystem context. They remain the property of their respective owners. PatchOath is not sponsored by, endorsed by, or affiliated with those owners unless an explicit written statement says otherwise.

## Copyright and repository license

The original PatchOath source and documentation in this repository are distributed under the MIT License in [`LICENSE`](LICENSE). Historical commits may contain the former VibeTrace working name; changing the product name does not alter the repository's copyright history or license.

The MIT License permits broad reuse but requires preservation of its copyright and permission notice in copies or substantial portions of the licensed software. It also contains warranty and liability disclaimers.

Do not copy third-party source, documentation, screenshots, icons, logos, datasets, prompts, or substantial text into this repository merely because they are publicly accessible. A contribution must either be original, be used under an applicable license/permission, or fall within another legally supportable basis that the contributor is prepared to document.

Functional similarity, prior-art study, interoperability research, and use of general software ideas are not a license to copy another project's protected source code, expressive documentation, artwork, or other protectable material. When comparing with related projects, prefer independently implemented behavior and factual descriptions over transplantation of code or prose.

Current first-party media provenance is recorded in [`docs/asset-provenance.md`](docs/asset-provenance.md).

## Contributions and provenance

Contributors must have the right to submit what they contribute. In particular, do not submit:

- proprietary employer/client code without authorization;
- code copied from a source whose license is incompatible with this repository;
- third-party logos, screenshots, fonts, media, or datasets without appropriate rights;
- secrets, personal data, or confidential repository contents; or
- AI-generated material when the contributor cannot reasonably represent that they have the right to submit and license the resulting contribution.

The contribution policy in [`CONTRIBUTING.md`](CONTRIBUTING.md) applies in addition to the MIT License. Pull requests also contain an explicit rights/provenance checklist so new dependencies, copied material, and generated content trigger review rather than silently entering the project.

## Third-party software

The core packaged CLI currently has no declared runtime npm dependencies. Development and optional visual tooling listed in the lockfile is currently limited to software whose package metadata reports permissive licenses in the reviewed baseline, including Apache-2.0 and MIT.

The reviewed baseline is recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and CI runs a conservative rights/release check. An unknown or newly introduced package license is treated as a review event rather than automatically assumed compatible.

The npm package allowlist intentionally excludes `node_modules`, CI files, tests, and development scripts. The package includes its MIT license, this legal boundary document, and the third-party notice baseline. Optional browser tooling and browsers installed by Playwright are not represented as PatchOath-authored software and may have their own licenses and notices.

When adding a runtime dependency, bundled asset, copied code sample, icon, font, browser binary, or other redistributed third-party material, the pull request must identify its source and license and determine whether attribution, notice, source-offer, patent, copyleft, trademark, or redistribution obligations apply before merge.

## Related work, patents, and originality claims

PatchOath operates in a field with substantial prior art. [`docs/related-work.md`](docs/related-work.md) records important public overlap and deliberately avoids broad invention claims.

The project must not market common ideas such as Git diffing, prompt tracking, intent-mismatch warnings, blast-radius analysis, risk scoring, path authorization, least privilege, policy repair, session replay, evidence bundles, hashes/receipts, human approval logs, visual regression, or selective disclosure as if PatchOath invented those general concepts.

The project's defensible contribution should be described more narrowly: a local workflow that keeps **inferred intent, explicit execution authority, observed effect, mechanical review proposals, historical human review, and disclosure authority semantically separate**, while binding selected evidence into deterministic, versioned integrity records and preserving those boundaries during verification.

A public prior-art or patent search is useful engineering diligence but does **not** establish freedom to operate. Patent scope depends on claims, jurisdiction, priority, family history, validity, status, and the actual implementation. If commercialization makes patent exposure material, obtain a private claim-focused review from qualified counsel rather than treating repository documentation as a non-infringement opinion.

## Local data and privacy

PatchOath is designed as a local-first tool. The core repository currently contains no product telemetry or analytics client that sends checkpoint data to a PatchOath-operated service.

Fresh repositories store local evidence under `.patchoath/`. Repositories that already contain the historical `.vibetrace/` evidence store may continue using it in compatibility mode so old checkpoints and receipts are not silently moved or rewritten.

Either local store can contain sensitive evidence, including:

- prompt text or prompt-derived metadata;
- repository paths and change summaries;
- Git object identifiers and checkpoint metadata;
- file-level effect manifests in newer evidence receipts;
- screenshots;
- DOM/layout fingerprints;
- Historical Effect Review notes and reviewer labels; and
- reports derived from the above.

Users should treat the evidence store as potentially confidential and review its contents before committing, uploading, attaching, or sharing it. Minimum-disclosure Evidence Capsules exist precisely because a complete local checkpoint/report is not automatically a safe sharing artifact.

Visual capture navigates to a URL supplied by the user. Loading that page may itself contact the target application's server and any third-party resources that the page normally loads. PatchOath does not imply that visiting a URL is private, anonymous, or authorized. Users are responsible for having permission to access and capture the target and for complying with applicable privacy, confidentiality, workplace, and website terms.

## Repository and code authorization

PatchOath does not grant permission to inspect, copy, modify, capture, or restore a repository that the user is not otherwise authorized to access. The user is responsible for ensuring that their use of PatchOath is permitted by the repository owner, employer/client policies, applicable licenses, contracts, and law.

Guarded restore is an operational safety feature, not a backup service, legal hold mechanism, records-management system, or guarantee against data loss.

## Security, safety, and accuracy claims

Risk, Blast Radius, intent inference, protected-surface classification, visual comparison, authorization checks, Contract Delta, Historical Effect Review, disclosure checks, and evidence verification have deliberately limited meanings described in the README and architecture documentation.

PatchOath must not market heuristic or integrity output as:

- a guarantee that code is secure, correct, compliant, or non-infringing;
- a substitute for professional security, legal, privacy, patent, or code review;
- proof of authorship or identity;
- proof that a particular AI agent caused a change;
- permission to widen future agent authority merely because a historical Contract Delta is mechanically sufficient;
- permission to widen future authority merely because a Historical Effect Review recorded `accept-effect`; or
- proof that a visually unchanged page is semantically unchanged.

Evidence Receipts, Contract Delta receipts, Historical Effect Review records, and Disclosure Receipts are integrity records with specific scopes. They are not digital signatures, identity certificates, or certificates of legal provenance.

## Release checklist for legal-risk changes

The fuller gate lives in [`docs/release-readiness.md`](docs/release-readiness.md). Before a public binary/package release or commercial launch, maintainers should re-check at least:

1. project and package-name clearance for the actual launch jurisdictions and goods/services;
2. third-party dependency and bundled-asset licenses/notices;
3. copyright notices and contribution provenance;
4. asset/font/screenshot provenance;
5. privacy/data-flow statements against actual code behavior;
6. claims made in README, website, screenshots, launch posts, and badges;
7. use of third-party trademarks/logos and any implied affiliation;
8. whether any new cloud, telemetry, account, payment, or data-retention feature creates additional privacy/consumer-law obligations; and
9. whether qualified counsel should review the intended jurisdictions, marks, patent/FTO exposure, and business model.

If implementation and documentation disagree, the safer claim wins until the discrepancy is resolved.
