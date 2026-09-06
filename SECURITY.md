# Security policy

PatchOath reads Git state, writes local checkpoint evidence, can capture an explicitly supplied local/web URL, and can perform a guarded worktree restore. Bugs that execute unintended commands, escape repository boundaries, expose prompt/code evidence, weaken verification, bypass declared authority boundaries, or overwrite later developer work are security-sensitive.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/feifeing/vibetrace/security/advisories/new). Do not open a public issue containing exploit details, private repository content, credentials, tokens, screenshots, prompt text, or proprietary evidence.

Include the affected command, operating system, Node and Git versions, expected behavior, observed behavior, and a minimal reproduction when it is safe to share.

## Supported versions

Until the first tagged stable release, only the current `main` branch receives security fixes. This policy will be updated when versioned releases begin.

## Security boundaries

- PatchOath invokes Git with argument arrays rather than interpolated shell command strings.
- New local evidence is written beneath `.patchoath/`, which may contain prompts, paths, screenshots, DOM fingerprints, review records, and reports. Treat it as potentially sensitive.
- Legacy `.vibetrace/` evidence may still be read for migration compatibility; PatchOath does not require rewriting it to validate old records.
- Visual capture visits only an explicit `http://` or `https://` URL supplied by the user.
- Snapshot capture uses a temporary Git index. It does not intentionally move `HEAD`, replace the real index, stash the worktree, or reset the current branch.
- `patchoath restore` is a dry run unless `--apply` is supplied explicitly.
- Restore is blocked when the current worktree differs from the recorded checkpoint after-state, and the drift guard is checked again immediately before mutation.
- Restore uses a temporary Git index and verifies that `HEAD` and the real index remain unchanged.
- After an applied restore, PatchOath snapshots the resulting worktree and verifies that it matches the recorded checkpoint before-state.
- There is intentionally no force-restore mode. Later work is not silently stashed, merged, reset, or discarded.
- Historical Effect Review Records are retrospective only. Recording `accept-effect` must not mutate the Change Contract or grant future execution authority.
- Evidence Capsules are the intended reduced-disclosure artifact. A full local report should not be treated as safe to share by default.
- Reviewer labels are not identity authentication.
- A valid Evidence Receipt demonstrates deterministic internal consistency within its documented coverage; it does not prove authorship, trusted execution, semantic correctness, or freedom from malicious local rewriting by an actor controlling all evidence.

## Restore guarantee

A successful guarded restore proves a narrow operational property: PatchOath observed the expected checkpoint after-state immediately before restore and produced a worktree matching the recorded before-state without intentionally changing `HEAD` or the real index.

It is not a substitute for backups, repository permissions, branch protection, code review, dependency review, or semantic correctness checks.

## Evidence and disclosure

Before attaching any PatchOath-generated artifact to an issue, pull request, email, or public report, inspect it for proprietary prompts, source paths, screenshots, DOM-derived data, and contract patterns. Prefer a minimum-disclosure capsule when the recipient does not need the full local evidence set.
