# Contributing to PatchOath

PatchOath should make AI-generated changes easier to inspect without adding another layer of mystery. Contributions are welcome when they strengthen this evidence chain:

`Intent → Authority → Effect → Review → Disclosure`

## Before opening a pull request

1. Explain the developer problem, not only the implementation.
2. Keep the change inside PatchOath's product boundary; general chat, IDE, autonomous-agent, and generic Git-GUI features are out of scope.
3. Add or update tests for behavior changes.
4. Include before/after evidence for interface changes.
5. Do not describe a heuristic as AI certainty or a pixel change as a semantic regression.
6. Identify any third-party code, assets, datasets, examples, or generated material introduced by the change and document the source plus applicable license/permission.
7. Run the rights/release gate when dependencies, package metadata, web assets, fonts, notices, or release behavior change.
8. Preserve the separation between inferred intent, explicit authority, historical review, and disclosure authority.

## Contribution rights and provenance

By intentionally submitting a contribution for inclusion in this project, you agree that the contribution may be distributed under the repository's MIT License and represent that you have the right to submit it on those terms.

Do not submit:

- proprietary employer or client code unless you are authorized to contribute it;
- copied code or documentation whose license is incompatible with this repository;
- third-party logos, screenshots, fonts, media, datasets, or substantial text without appropriate rights;
- secrets, credentials, confidential material, or personal data that should not become public; or
- AI-generated material when you cannot reasonably represent that you have the right to submit and license the resulting contribution.

If a contribution is derived from another open-source project, identify the source repository, relevant file(s), upstream license, and any notices that must be preserved. When provenance or licensing is uncertain, open an issue before submitting the material.

Maintainers may require a Developer Certificate of Origin (DCO) sign-off or another contribution mechanism before accepting third-party contributions as the project matures. A sign-off is not a substitute for actually having the rights described above.

See [`LEGAL.md`](LEGAL.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), [`docs/brand-clearance.md`](docs/brand-clearance.md), and [`docs/asset-provenance.md`](docs/asset-provenance.md) for the project's copyright, trademark, privacy, dependency, and asset boundaries.

## Local setup

```bash
git clone https://github.com/feifeing/vibetrace.git
cd vibetrace
npm install
npx playwright install chromium
npm run verify
```

The repository slug is temporarily retained during the v0.3 brand migration. Product-facing commands use `patchoath`.

Useful focused commands:

```bash
npm test             # core, Git, schema, CLI, and visual unit tests
npm run test:e2e     # Chromium interaction and responsive checks
npm run check        # JavaScript syntax and JSON validation
npm run rights:check # rights, provenance, package, brand, and asset-release baseline
npm run format       # apply repository formatting
npm run dev          # run the interactive report at 127.0.0.1:4173
```

## Architecture boundaries

- Git commands belong in `src/git/`; use `execFileSync` argument arrays, never shell-interpolated commands.
- Prompt inference and risk scoring must remain deterministic and separately testable.
- Explicit authorization, inferred intent, historical review, and disclosure authority must remain semantically distinct.
- Schema/evidence-version changes require migration and backward-compatibility tests.
- The primary CLI executable is `bin/patchoath.mjs`; keep it thin and put behavior in importable modules.
- The browser report consumes derived checkpoint evidence. Do not duplicate contract or risk logic in the UI.
- Optional visual dependencies must fail with an actionable message while the core Git workflow keeps working.
- New writes belong under `.patchoath/` and `refs/patchoath/`; legacy namespaces are read only for explicit compatibility paths.
- Do not silently rewrite or "upgrade" old evidence IDs. Historical records must remain verifiable under the semantics that created them.

## Testing Git and evidence behavior

Git parsing needs tests for unusual paths, renames, binary files, staged plus unstaged edits to the same file, and untracked files. Use temporary repositories; never depend on this repository's own worktree state.

Evidence changes should test both the positive path and a tamper/drift path. In particular, changes touching review, restore, receipt, or disclosure behavior should prove the corresponding safety invariant rather than only checking CLI output.

## Pull-request scope

Prefer one coherent capability per pull request. A useful description answers:

- What user question becomes easier to answer?
- Which evidence is captured, recomputed, or exposed?
- What could be misclassified or misunderstood?
- How was the change verified?
- Did the checkpoint schema, evidence coverage, authorization model, risk score, or disclosure boundary move?
- Did the change introduce any third-party material, new data flow, external service, telemetry, or redistribution obligation?
- Does the change weaken any authority invariant or legacy-verification guarantee?

Maintainers may ask broad feature proposals to begin as an issue so the product boundary stays sharp.
