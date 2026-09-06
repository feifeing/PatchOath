# Evidence Receipts

PatchOath Evidence Receipts are deterministic integrity records for completed checkpoints. They are designed to answer a narrow question:

> Does the evidence stored with this checkpoint still match the evidence that was used to create its receipt?

They are **not** digital signatures, proof of authorship, semantic correctness certificates, or proof that an AI-generated change is safe.

## Receipt identifiers

New PatchOath Evidence Receipts use the `poe_*` prefix:

```text
poe_<24 hex characters>
```

Historical VibeTrace receipts using `vtr_*` remain verifiable for compatibility.

The identifier is derived from a stable SHA-256 projection of versioned checkpoint evidence.

`patchoath verify` recomputes the receipt using the stored receipt's own evidence version and compatible prefix. This matters because PatchOath intentionally preserves the verification semantics of older checkpoints instead of silently reinterpreting them under a newer receipt schema.

## Evidence Receipt v2

New completed checkpoints use Evidence Receipt **v2**.

Version 2 binds:

- checkpoint and session identifiers;
- prompt hash and prompt source;
- the explicit Change Contract when present;
- repository HEAD at checkpoint start;
- before and after Git commit objects;
- change summary;
- a normalized file-level effect manifest;
- inferred intent analysis;
- Change Contract compliance analysis;
- Blast Radius analysis;
- deterministic risk analysis;
- visual comparison analysis when present; and
- before/after screenshot and DOM hashes when visual capture exists.

The file-level manifest uses a deliberate allowlist of effect fields:

```text
path
oldPath
status
additions
deletions
binary
category
module
directory
extension
signals
```

File paths are normalized to `/`, file rows are sorted, and signal arrays are sorted before hashing. Reordering equivalent rows therefore does not manufacture a new receipt, while changing the actual path, status, churn, classification, or signals does.

The receipt also stores an explicit SHA-256 digest of the normalized manifest for inspection, although the manifest itself is already part of the overall receipt evidence.

## Why v2 was needed

Evidence Receipt v1 bound aggregate and derived analysis such as summary, Contract compliance, Blast Radius, and risk, plus Git before/after object IDs. It did **not** directly bind the stored `analysis.files` manifest, inferred intent object, or visual-analysis object.

That did not make the Git checkpoint objects invalid evidence. In fact, `patchoath contract-delta` is deliberately designed to recompute its observed effect from the before/after Git objects instead of trusting `analysis.files`.

But the narrower v1 receipt scope made broad wording such as “the receipt binds the analysis” too easy to overread.

Receipt v2 closes that coverage gap for newly recorded checkpoints.

## Legacy v1 compatibility

Existing v1 receipts remain verifiable.

PatchOath does not silently replace a stored v1 receipt with a v2 receipt during verification, because doing so would change the historical receipt identifier and pretend the original receipt covered evidence that it never covered.

A successful v1 verification therefore reports explicit legacy coverage:

```text
coverage legacy-v1 · file manifest / intent analysis / visual analysis not bound
```

Machine-readable verification exposes the same distinction:

```json
{
  "coverage": {
    "evidenceVersion": 1,
    "fileManifestBound": false,
    "intentAnalysisBound": false,
    "visualAnalysisBound": false,
    "scope": "legacy-v1"
  }
}
```

A v2 receipt reports:

```json
{
  "coverage": {
    "evidenceVersion": 2,
    "fileManifestBound": true,
    "intentAnalysisBound": true,
    "visualAnalysisBound": true,
    "scope": "effect-manifest-v2"
  }
}
```

The Dashboard's Trust Scope uses this same coverage object rather than reducing both versions to an undifferentiated “verified” badge.

## Resaving old checkpoints

When PatchOath saves a completed checkpoint that already has a supported Evidence Receipt, it preserves the stored receipt's evidence version and legacy prefix when applicable.

This prevents an unrelated resave from silently turning:

```text
legacy receipt ID A
```

into:

```text
new receipt ID B
```

New checkpoints with no existing receipt use the current receipt version and the `poe_*` namespace.

An unsupported evidence version is rejected explicitly instead of being guessed or coerced into a supported schema.

## Verification layers remain separate

Receipt verification is one layer of `patchoath verify`.

The full command also checks, when available:

- whether before/after Git commit objects still exist;
- whether PatchOath or historical VibeTrace private refs still point at the recorded objects; and
- whether referenced visual artifact bytes still match their recorded SHA-256 hashes.

A receipt coverage label describes what metadata/analysis the receipt itself binds. It does not replace those independent Git/ref/artifact checks.

Likewise, a valid v2 receipt does not prove that the prompt interpretation was correct or that the resulting code is safe. It proves only that the versioned evidence projection still matches.

## Privacy boundary

A full checkpoint and its local Evidence Receipt can contain sensitive structural information, including a Change Contract and, in v2, a file-level manifest.

Do not treat the local receipt object as a minimum-disclosure sharing format.

For external sharing, generate a separate Evidence Capsule:

```bash
patchoath capsule <checkpoint>
```

The Capsule links back to the source Evidence Receipt while applying an independent Disclosure Policy. See [Review Control Plane](review-control-plane.md) and [Disclosure Boundary](disclosure-boundary.md).
