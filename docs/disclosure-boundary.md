# Disclosure boundaries and Evidence Capsules

PatchOath treats two different kinds of authority as separate objects:

```text
Execution boundary   what a coding change is allowed to touch
Disclosure boundary  what captured evidence is allowed to reveal
```

The first is represented by a **Change Contract**. The second is represented by a **Disclosure Policy**.

This distinction matters because evidence collected for review can itself contain sensitive information. A tool can successfully prevent an agent from touching `src/auth/**` and still create a new problem if its exported report silently includes confidential prompt text, private repository paths, screenshots, DOM evidence, or source patches.

## Evidence Capsule

`patchoath capsule` creates a local, portable JSON projection of a completed checkpoint.

The default policy is deny-by-default for high-disclosure fields:

```bash
patchoath capsule
```

The minimum-disclosure capsule keeps structural review evidence such as:

- the source Evidence Receipt ID;
- prompt hash, but not prompt text;
- whether authorization was declared;
- counts and numeric budgets, but not allow/deny path patterns;
- change summary statistics;
- contract-compliance status and violation IDs;
- Blast Radius and risk scores plus factor IDs/points;
- visual hashes when captures exist, but not screenshot bytes.

It omits by default:

```text
prompt text
changed file paths
change-contract path patterns
Git patch/source code
screenshot bytes
```

Expanded disclosure must be explicit:

```bash
patchoath capsule --include-prompt
patchoath capsule --include-paths
patchoath capsule --include-contract
```

These flags enlarge the disclosure surface; they do not make the additional data safe to publish. Review the resulting capsule before sharing it.

## Disclosure Receipt

A new capsule receives a deterministic `pod_*` **Disclosure Receipt** derived from:

```text
source Evidence Receipt ID
+ Disclosure Policy hash
+ disclosed projection hash
```

Historical `vtd_*` receipts remain verifiable when reading legacy evidence.

This creates a compact integrity link between the full local evidence record and the particular projection chosen for sharing.

The current receipt is not a signature and does not authenticate the person or machine that created the capsule. It proves only internal consistency of the capsule's disclosed projection and its recorded source-receipt link.

Verify a capsule without loading its original checkpoint:

```bash
patchoath capsule --verify .patchoath/capsules/<checkpoint>.capsule.json
```

Repositories already using the historical `.vibetrace/` evidence store may continue to keep capsules there in compatibility mode; PatchOath does not silently move or rewrite that evidence.

## Disclosure Drift

PatchOath uses **Disclosure Drift** for a narrow condition:

> the artifact contains a class of data that its own Disclosure Policy says must be omitted.

For example, a minimum-disclosure capsule that contains `evidence.prompt.text` is in disclosure drift even if its other hashes are well formed.

The verifier checks the policy independently of the Disclosure Receipt so two failure modes stay distinct:

```text
disclosure-drift             forbidden field class is present
disclosure-receipt-mismatch  disclosed projection or policy changed
```

This is intentionally analogous to, but separate from, Authorization Drift:

```text
Authorization Drift  observed code effect crossed the declared execution boundary
Disclosure Drift     shared evidence crossed the declared disclosure boundary
```

## Deny-by-default schema

The capsule generator does not clone the checkpoint object and then delete sensitive fields. It constructs the shareable projection from an explicit allowlist of fields.

That design is important for forward compatibility: if a future checkpoint schema adds a new sensitive field, it does not automatically appear in a minimum-disclosure capsule merely because an object spread or serializer picked it up.

Tests use canary prompt text, repository paths, and contract patterns and assert that the serialized default capsule does not contain them.

## Privacy boundary

Minimum disclosure reduces accidental exposure; it does not make a capsule anonymous or non-sensitive.

Hashes, timestamps, risk summaries, budgets, violation classes, and other structural metadata may still reveal information. Hashes of low-entropy values can sometimes be guessed by dictionary attack. Do not treat the current capsule format as a zero-knowledge proof or a cryptographic confidentiality system.

A future selective-opening layer may use salted commitments or stronger privacy-preserving proofs, but those mechanisms should be introduced only with an explicit threat model and without relabeling standard cryptographic primitives as PatchOath inventions.

## Related-work boundary

Evidence packs, selective disclosure, cryptographic commitments, audit trails, and policy-based redaction all have substantial prior art. PatchOath does not claim to have invented those primitives.

The project-specific design being explored here is the **dual-boundary workflow** for AI-assisted code changes:

```text
Prompt Intent
   ↓
Execution / Change Contract
   ↓
Observed Git + visual effect
   ↓
Authorization Drift
   ↓
Full local Evidence Receipt
   ↓
Disclosure Policy
   ↓
Minimum-disclosure Evidence Capsule
   ↓
Disclosure Drift + Disclosure Receipt
```

The practical goal is to make both modification authority and evidence-sharing authority explicit, inspectable, and independently verifiable.
