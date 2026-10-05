# Changelog

All notable user-facing changes to PatchOath are recorded here.

The project is still alpha. Entries describe implemented behavior; they are not promises of semantic correctness, security, legal compliance, or future API stability.

## Unreleased

### Evidence workflow

- Validate physical evidence directories, managed file types, storage schemas, and record IDs before reading or writing; publish changes through exclusive temporary files and atomic replacement.
- Check active checkpoint HEAD/branch anchors, verify source receipts and snapshot refs before restore, and only recover mutation locks whose same-host process is demonstrably absent.
- Add read-only `patchoath doctor` diagnostics for the evidence trust graph, including JSON output and stable diagnostic IDs.
- Record ignored-root counts and a root-set digest without collecting ignored paths or contents; identify snapshot eligibility separately from receipt-bound capture coverage.
- Confine visual comparison inputs and report assets to their evidence directories; validate and rebuild report output without following redirection links or reusing stale assets.

- Evaluate both rename endpoints against path and protected-surface authorization; include source modules and directories in risk model v3 without changing historical receipts.
- Keep submodule commit-pointer changes visible despite Git ignore settings; refuse parent worktree capture when submodule content cannot be represented.
- Disable external diff drivers, text conversion, and terminal color for object-based evidence diffs.
- Render untrusted report statistics as escaped text and include the report's required `polish.css` asset.
- Make generated reports directly openable from local HTML files using separately scoped classic scripts; verify the complete offline review UI in Chromium.
- Normalize Git-managed line endings in the restore regression test so Windows CRLF checkout behavior is covered correctly.
- Keep Windows browser-test cleanup reliable by waiting for the fixture server to exit before removing its directory; enforce LF source checkouts across platforms.

### Presentation and maintenance

- Refresh the dashboard with a clearer scope example, explicit sample-session labels, demo/setup entry points, responsive layouts, keyboard navigation, and reduced-motion support.
- Copy the command actually displayed, and keep demo onboarding separate from reports generated with real evidence; an empty report never displays sample checkpoints.
- Add a concise Chinese README, a practical getting-started guide, and updated product screenshots. Bundle linked documentation with source-installed packages.
- Use the current `feifeing/PatchOath` repository URLs and enforce them in the release gate.
- Add weekly dependency-update configuration and high-severity dependency auditing; pin workflow actions to immutable commits.

## 0.3.0 — 2026-09

### Product identity

- Renamed the product and primary CLI from the earlier VibeTrace working identity to **PatchOath**.
- Added the `patchoath` package/CLI identity, `.patchoath/` state for fresh repositories, `refs/patchoath/...` Git refs, and `po_` / `poe_` / `pocd_` / `pod_` / `por_` evidence namespaces.
- Preserved verification compatibility for historical `.vibetrace/` stores, legacy refs, legacy receipt IDs, and a deprecated `vibetrace` CLI shim during the v0.3 migration window.
- Rebuilt the README and Dashboard around the product model **Intent → Authority → Effect → Review → Disclosure**.

### Evidence and authority

- Added explicit Change Contracts for allow/deny paths, protected surfaces, and file/line/module budgets.
- Added Authorization Drift as a deterministic signal when an observed Git effect crosses an explicit contract.
- Added versioned Evidence Receipt v2 coverage, including the normalized file-level effect manifest, intent analysis, contract compliance, risk, and available visual-analysis hashes.
- Added observed-effect Contract Delta proposals that recompute the Git effect from recorded before/after objects, never automatically relax protected boundaries, and never grant future authority.
- Added counterfactual replay of a restricted candidate contract against the same historical Git effect.

### Human review

- Added Historical Effect Review Records with `accept-effect`, `reject-effect`, and `needs-follow-up` outcomes.
- Kept review records outside checkpoint JSON and bound them to their source Evidence Receipt.
- Enforced the invariant that accepting a historical effect does not mutate the Change Contract or grant future agent authority.
- Kept reviewer labels explicitly unauthenticated unless a future identity mechanism is introduced separately.

### Disclosure and privacy

- Added minimum-disclosure Evidence Capsules with a separate Disclosure Policy and Disclosure Receipt.
- Default capsule projection omits full prompt text, changed file paths, full contract patterns, Git patches, and screenshot bytes.
- Added Disclosure Drift checks for data classes that violate the capsule's own policy.
- Required source Evidence Receipt verification before capsule export.
- Made explicit capsule output paths create-only by default; replacement requires an explicit `--force` choice.

### Git and restore safety

- Kept checkpoint capture non-mutating with respect to `HEAD`, the active branch, and the real Git index by using temporary indexes and private refs.
- Added guarded restore with dry-run-first behavior and drift checks before application.
- Kept restore separate from Historical Effect Review: rejecting or accepting a review record does not silently change the worktree.

### Visual evidence and Dashboard

- Added optional Playwright before/after captures, pixel comparison, basic layout movement analysis, and basic DOM fingerprinting.
- Kept semantic correctness explicitly unsupported rather than inferred from visual stability.
- Added the Review Control Plane, Historical Effect Review display, Disclosure boundary, explicit trust scope, and responsive mobile checks.
- Replaced the retired interface screenshot with a Chromium-E2E-derived PatchOath dashboard hero.

### Rights, provenance, and release discipline

- Added legal/privacy boundaries, related-work/non-novelty documentation, asset provenance, third-party notices, and a conservative `rights:check` gate.
- Recorded a public collision-reduction screen for the PatchOath name while explicitly avoiding claims of trademark registration or formal legal clearance.
- Kept the npm package `private: true` pending a deliberate public-release decision.
- Added cross-platform packaged CLI smoke tests on Ubuntu and Windows plus Node 20/22 and Chromium CI coverage.

### Known release blockers outside the code tree

- The GitHub repository slug and description still use the retired platform identity until repository Settings are updated.
- `main` still requires GitHub branch-protection/ruleset enforcement so passing CI cannot be bypassed casually.
- Patent/contributor-license governance remains an explicit pre-scale decision; the repository currently remains MIT licensed.

## 0.2.0 — 2026-09

Earlier alpha milestone that established the local checkpoint → diff → visual evidence → timeline/report loop, non-mutating Git snapshot mechanics, deterministic Blast Radius/risk analysis, sessions, and initial restore foundations under the project's former working identity.
