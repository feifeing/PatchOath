# PatchOath Trust Graph Doctor

`patchoath doctor` is a read-only integrity audit for the local PatchOath evidence system.

It answers a different question from `patchoath verify`:

- `verify` checks one completed checkpoint and the evidence directly bound to its Evidence Receipt.
- `doctor` checks whether the **repository-wide local evidence graph** is internally connected and still inspectable.

```bash
patchoath doctor
patchoath doctor --json
```

## What it checks

The doctor currently audits:

1. **Git repository state** — the repository has a committed `HEAD` that PatchOath can inspect.
2. **Store selection** — whether `.patchoath/`, legacy `.vibetrace/`, or both are present.
3. **Managed-file safety and schemas** — config, state, session, and checkpoint records must pass the same physical-file and schema boundaries used by the core store.
4. **Storage identity binding** — a managed filename such as `po_abc.json` cannot contain a different checkpoint identity such as `po_xyz`.
5. **Session/checkpoint graph integrity** — current session, session indexes, checkpoint ownership, and active-checkpoint state must agree.
6. **Evidence Receipts** — every completed checkpoint receipt is deterministically recomputed.
7. **Git snapshot bindings** — recorded before/after commit objects must still exist and at least one current/legacy compatibility ref must resolve to the recorded commit.
8. **Historical Effect Reviews** — managed review files retain their record identity and still verify against the checkpoint and Evidence Receipt they claim to review.
9. **Managed Evidence Capsules** — default capsules in the PatchOath store must retain filename/source identity, a matching source Evidence Receipt link, and a valid Disclosure Receipt/policy audit.

Explicit capsule files written elsewhere with `--out` are user-selected outputs and are not silently pulled into the repository-wide audit.

## Status model

Each check is reported independently:

- `PASS` — the tested invariant holds.
- `WARN` — no integrity break was proven, but the state deserves attention. Examples include an uninitialized repository or both modern and legacy stores being present.
- `FAIL` — a deterministic evidence invariant is broken or a managed evidence surface cannot be inspected safely.

The human output is intentionally compact:

```text
PatchOath doctor · demo
repository main @ 4c92fbb4d8d3
PASS git.repository · Repository demo is on main at 4c92fbb4d8d3.
PASS store.selection · Using .patchoath/.
PASS store.integrity · .patchoath/ config and state passed managed-file and schema validation.
PASS trust.graph · 1 session(s) and 2 checkpoint(s) form a consistent storage graph.
PASS receipts.integrity · 1 completed checkpoint receipt(s) recompute successfully.
PASS git.snapshots · 3 recorded snapshot(s) retain both Git objects and matching refs.
PASS reviews.integrity · 1 Historical Effect Review record(s) remain bound to their source receipts.
PASS capsules.integrity · 1 managed Evidence Capsule(s) verify and retain their source receipt links.
summary 8 pass · 0 warn · 0 fail
```

`--json` returns a versioned diagnostic object with the same check IDs, statuses, messages, optional details, and aggregate counts.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | Audit completed and no integrity check failed. Warnings may still be present. |
| `1` | The command itself could not complete, for example because it was run outside a Git repository. |
| `2` | The audit completed and found one or more broken evidence invariants. |

This makes `patchoath doctor --json` usable in local scripts or pre-release checks without treating a normal “not initialized yet” state as corruption.

## Read-only boundary

`doctor` does **not** call `patchoath init`, create directories, rewrite malformed JSON, repair Git refs, delete unknown files, regenerate receipts, or mutate session indexes.

That is deliberate. Diagnostics and repair authority are separate concerns. A future repair command, if introduced, should require explicit mutation authority and should never be hidden inside a health check.

## What a healthy result does not prove

A green doctor result proves only the deterministic invariants it checks. It does not prove:

- authorship or reviewer identity;
- semantic correctness of the code change;
- absence of malicious code;
- correctness of a user's Change Contract;
- trustworthiness of the host machine or Git implementation;
- that external copies of Evidence Capsules remain unchanged.

The doctor is a consistency auditor, not a security oracle.
