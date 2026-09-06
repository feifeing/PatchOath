# PatchOath Change Contracts

A PatchOath Change Contract is an explicit authorization boundary for one recorded code change.

It is intentionally separate from prompt intent:

```text
Prompt            what the developer wants
Change Contract   what the change is allowed to touch
Observed effect   what Git and optional visual evidence show happened
```

A prompt can be vague. A declared contract is evaluated deterministically.

## Contract primitives

A guarded checkpoint or one-shot attestation can combine these rules:

```bash
patchoath checkpoint \
  --prompt "Refine the checkout card" \
  --allow "src/checkout/**,src/styles/**" \
  --deny "src/private/**" \
  --protect-surface "auth,database,dependencies,ci" \
  --max-files 5 \
  --max-lines 120 \
  --max-modules 1
```

| Rule                           | Meaning                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `--allow <glob,...>`           | If present, every changed path must match at least one allowed glob.             |
| `--deny <glob,...>`            | Matching paths are explicitly protected even if an allow rule also matches.      |
| `--protect-surface <name,...>` | Files classified into the selected sensitive surfaces are protected.             |
| `--max-files <n>`              | The change may modify at most `n` files.                                         |
| `--max-lines <n>`              | Total additions + deletions may not exceed `n`.                                  |
| `--max-modules <n>`            | The change may span at most `n` deterministically classified repository modules. |

All numeric limits are non-negative integers. A limit of `0` is valid and means no matching change is authorized under that budget.

## Protected surfaces

`--protect-surface` is a repository-independent convenience over PatchOath's deterministic file classifier. The current supported names are:

```text
ci
dependencies
auth
database
routing
public-api
global-styles
config
```

For example:

```bash
patchoath attest \
  --prompt "Adjust the marketing hero" \
  --protect-surface "auth,database,dependencies,ci" \
  --max-modules 1
```

can reject an observed change that touches an authentication file or lockfile even when the caller did not know the repository's exact sensitive path names in advance.

Protected surfaces are **classifiers, not semantic proofs**. They use inspectable filename/path rules. A sensitive file with an unusual name can evade classification, and a coincidentally named file can be classified conservatively. Use explicit `--deny` globs when a repository has known paths that must never change.

## Evaluation semantics

Rules compose as constraints; they do not grant exceptions to one another.

- A denied path is protected even when it also matches `--allow`.
- A protected surface is protected even when its path matches `--allow`.
- File, line, and module budgets are evaluated in addition to path and surface constraints.
- One or more violations produce `contractCompliance.status = "violated"`.
- Any explicit contract violation is surfaced as **Authorization Drift** in Blast Radius and risk analysis.

Current violation IDs are:

```text
protected-path-touched
protected-surface-touched
outside-authorized-scope
file-budget-exceeded
line-budget-exceeded
module-budget-exceeded
```

The exact violating paths and budget totals are preserved with checkpoint evidence.

## Module budgets

PatchOath uses the same deterministic module classifier for `--max-modules` that it uses for Blast Radius. It recognizes common monorepo roots such as `packages/*`, `apps/*`, and `services/*`, and otherwise falls back to stable top-level/module-like path groupings.

This makes a rule such as:

```bash
--max-modules 1
```

meaningfully different from `--max-files`: an agent can edit several files inside one authorized component without being treated the same as a change that spreads across checkout, auth, routing, and configuration.

## Persistence and receipts

For a two-phase checkpoint, the contract is stored when the checkpoint starts. `patchoath checkpoint --finish` restores that stored contract in a later CLI process and evaluates the final observed change against the original authorization.

The declared contract and resulting compliance evidence participate in the checkpoint's deterministic Evidence Receipt. Changing the stored authorization or compliance evidence after receipt creation causes `patchoath verify` receipt recomputation to fail.

## CI use

For an existing worktree change, `patchoath attest` evaluates the current `HEAD → worktree` effect without creating a two-phase session:

```bash
patchoath attest \
  --prompt "Update checkout copy" \
  --allow "src/checkout/**" \
  --protect-surface "auth,database" \
  --max-files 4 \
  --max-modules 1
```

Exit codes:

```text
0   contract compliant
1   usage/runtime error
2   explicit contract violated
```

This makes the command usable as a deterministic CI gate without pretending that PatchOath can infer the semantic safety of arbitrary code.

## Design boundary

A Change Contract answers a narrow question:

> Did the observed structural change remain inside the explicit boundary that the developer declared?

It does **not** prove that:

- the code is correct;
- the change is secure;
- the developer chose a sufficient contract;
- a protected-surface classifier recognizes every semantically sensitive file;
- the coding agent was the actor that produced the observed change.

Those are separate claims and should remain separate from Authorization Drift.
