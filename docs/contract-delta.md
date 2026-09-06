# Observed-effect Change-Contract Delta

A Change Contract tells PatchOath what an AI-assisted change is explicitly allowed to touch. When an observed change violates that contract, a useful follow-up question is:

> If a human actually intended to approve this exact observed result, what is the narrowest mechanical change PatchOath can safely propose to the existing contract?

`patchoath contract-delta` answers that question without applying or persisting any permission change.

## What the command does

```bash
patchoath contract-delta
patchoath contract-delta po_204718_a91f3c --json
```

The command:

1. selects a completed checkpoint;
2. recomputes its Evidence Receipt and refuses to continue if the receipt no longer matches;
3. recomputes the actual file effect directly from the before/after Git objects instead of trusting cached `analysis.files`;
4. evaluates that Git-derived effect against the original Change Contract;
5. constructs a restricted local delta; and
6. counterfactually re-evaluates the same observed effect against the candidate contract.

Nothing is written back to the checkpoint or repository authorization. The output is a review proposal, not permission.

## Restricted proposal vocabulary

PatchOath intentionally refuses to synthesize an arbitrary access-control policy.

It can propose only:

### Exact observed path grants

When an existing `--allow` boundary excludes a changed file, PatchOath may propose adding that exact observed repository path.

```text
before allow:
  src/checkout/**

observed outside scope:
  src/shared/currency.js

proposed addition:
  src/shared/currency.js
```

It does not generalize this to `src/shared/**` because the broader glob grants authority that the captured effect did not demonstrate a need for.

If a literal Git path contains `*`, the current glob-based contract language cannot safely represent it as an exact grant. PatchOath returns a human-review blocker instead of silently widening the pattern.

### Budget increases to observed totals

For an exceeded numeric budget, PatchOath proposes only the exact observed total:

```text
maxFiles    3 → 5   when exactly 5 files changed
maxLines   80 → 97  when exactly 97 changed lines were observed
maxModules  1 → 2   when exactly 2 modules were observed
```

It does not add arbitrary headroom.

## What is never proposed automatically

Observed behavior is not evidence that a protected boundary should disappear.

The command therefore never proposes:

```text
removing a --deny rule
unprotecting auth/database/dependencies/CI/etc.
turning an exact path into a broad glob
persisting or applying the candidate contract
```

A protected-path or protected-surface violation is returned as `human-review-required` even if other mechanical budget/path deltas can be computed.

This creates an intentional step-up boundary: sensitive authority requires a fresh human decision rather than being inferred from the fact that an agent already crossed it.

## Counterfactual replay

A generated candidate is immediately checked against the same Git-derived observed effect.

```text
original contract → observed effect → violated
candidate contract → same effect     → compliant
```

A `proposal-ready` result therefore means only:

> Within PatchOath's restricted proposal vocabulary, this candidate is sufficient for this exact previously observed effect and does not require relaxing a deny/protected-surface rule.

It does **not** mean the change was desirable, safe, correct, or should be approved for future work.

## Proposal Receipt

Each computed result gets a deterministic `pocd_*` proposal receipt bound to:

- the source Evidence Receipt ID;
- the original Change Contract hash;
- a normalized hash of the recomputed Git effect;
- the proposed local delta;
- human-review blockers; and
- the counterfactual compliance status.

This receipt makes repeated computation over the same evidence and rules comparable. It is not a signature, identity proof, approval token, or authorization grant.

## Verification boundary

`contract-delta` performs two deliberately specific integrity steps:

```text
sourceReceiptVerified = true
  → the checkpoint's deterministic Evidence Receipt recomputed successfully

gitEffectRecomputed = true
  → the file effect used by the proposal came from the recorded before/after Git objects
```

Those statements are narrower than the full `patchoath verify` command, which also checks PatchOath private refs and local visual artifacts when applicable.

The delta command does not label the entire checkpoint “fully verified” merely because these two prerequisites succeeded.

## Why the observed effect is recomputed

Cached analysis is useful for reports, but authorization proposals should not trust a mutable file list merely because adjacent summary metadata still hashes correctly.

The delta engine therefore treats the Git before/after object pair as its effect source. The stored `analysis.files` array is not used to decide which additional file authority would be proposed.

Tests intentionally save a checkpoint whose cached file array is empty while its Git objects contain a real two-module change. The CLI must recover the real paths from Git and produce the proposal from those paths.

## Minimality claim

Access-control policy repair and least-privilege synthesis are established research areas. PatchOath does not claim to compute a globally minimal policy.

Its claim is narrower and mechanically testable:

> The `restricted-local-delta-v1` proposal is minimal only inside a deliberately constrained vocabulary consisting of exact observed file additions and numeric-budget increases to observed totals, while deny rules and protected surfaces remain immutable.

Different policy languages could express different or more globally optimal repairs. PatchOath chooses a small proposal language because its output is intended for human review, not autonomous privilege escalation.

## Related-work boundary

Least privilege, step-up authorization, permission deltas, and access-control policy repair all predate this project. Current coding-agent security work also uses scoped permissions and approval gates.

The project-specific workflow being explored here is the combination of:

```text
explicit Change Contract
      ↓
verified before/after evidence
      ↓
observed Authorization Drift
      ↓
restricted local contract delta
      ↓
counterfactual replay on the same Git effect
      ↓
human step-up decision for protected authority
```

This should be described as PatchOath's design composition, not as invention of least privilege or policy repair itself.
