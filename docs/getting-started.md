# Getting started with PatchOath

[README](../README.md) · [简体中文](../README.zh-CN.md) · [Change Contract reference](change-contract.md)

Choose the path you need: the development dashboard is a safe way to explore sample evidence; the CLI captures evidence from your own Git repository.

## Requirements

- Node.js 20 or newer and npm.
- Git, with an existing commit in the repository you want to review.
- Chromium installed through Playwright only if you want screenshots.

Core Git capture, contracts, verification, and reports do not require a language model, a cloud account, or a running web app.

## Explore the sample dashboard

```bash
git clone https://github.com/feifeing/PatchOath.git
cd PatchOath
npm ci
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The dashboard uses bundled sample checkpoints so you can inspect the timeline, changed files, visual comparison, authority rules, and review layers before recording your own evidence.

It does not discover projects or capture changes by itself. Stop the server with Ctrl+C when you are finished.

The package remains `private: true` during the alpha release review. This guide installs the checked-in source rather than a public registry package.

## Make the CLI available

From the cloned PatchOath directory:

```bash
npm link
patchoath --version
```

If your environment does not permit a global link, run the entry point directly instead. Replace the example with the absolute path to your clone, and keep the current working directory in the Git project being reviewed:

```text
node "/absolute/path/to/PatchOath/bin/patchoath.mjs" init
```

For Windows, an equivalent entry-point path is `C:\path\to\PatchOath\bin\patchoath.mjs`. The commands below use the linked `patchoath` executable for readability.

## Record one real change

Enter your own Git repository. A clean baseline makes the first experiment easiest to interpret, although PatchOath can record an already-dirty worktree as the before-state.

```bash
patchoath init
```

This creates local `.patchoath/` evidence state and excludes it through `.git/info/exclude`. Evidence may contain prompts, paths, and screenshots; keep it local unless you deliberately choose what to disclose.

Before the coding agent edits, declare the intended request and explicit boundary. Adapt these patterns to your repository:

```bash
patchoath checkpoint --prompt "Refine the primary button" --allow "src/components/**,src/styles/**" --deny "src/auth/**,src/router/**" --max-files 3 --max-lines 80
```

The prompt is context. The allowed and denied paths and the size limits are constraints. A deny rule still wins when an allow rule also matches. Renames check both endpoints, and line budgets count additions plus deletions.

Let the agent edit the project. Inspect the live effect at any point:

```bash
patchoath diff
```

When the change is ready to review:

```bash
patchoath checkpoint --finish
patchoath verify
patchoath report --open
```

Finishing records the after-state and its versioned Evidence Receipt. Verification checks the recorded evidence against its documented coverage. The report is a derived, read-only view of that evidence and can be opened directly from local files.

Checkpoint capture uses a temporary Git index and preserves your branch, `HEAD`, and real index. It does not commit your changes to the current branch.

### If you already have edits

Use a one-shot attestation to compare `HEAD` with the current worktree:

```bash
patchoath attest --prompt "Review the button change" --allow "src/components/**,src/styles/**" --deny "src/auth/**" --max-files 3 --max-lines 80
```

Unlike a before/after checkpoint, this starts from `HEAD`; it cannot recover a pre-change page screenshot. See [Architecture](architecture.md) for the one-shot evidence model.

## Audit the local evidence graph

Use the doctor when you want to check the relationships across local evidence rather than only one checkpoint:

```bash
patchoath doctor
patchoath doctor --json
```

The first command prints a compact human-readable audit; `--json` writes a versioned diagnostic object to standard output. Exit `0` means no integrity check failed, even if warnings remain; `1` means a command/runtime error prevented completion; `2` means the completed audit found broken evidence invariants. Command errors are written to standard error rather than returned as a JSON result.

Doctor is read-only: it does not initialize the store, rewrite files, repair refs, or regenerate receipts. An uninitialized repository with an inspectable committed `HEAD` produces a warning and exit `0`. Continue using `patchoath verify` for a checkpoint's direct Git and visual-artifact checks. See [Trust Graph Doctor](trust-graph-doctor.md) for coverage and limitations.

## Add optional screenshots

From your PatchOath clone, install the browser once:

```bash
npx playwright install chromium
```

Start the app you want to review using its usual development command. In that app's Git repository, provide the URL when starting the checkpoint:

```bash
patchoath checkpoint --prompt "Refine the checkout summary" --allow "src/checkout/**,src/styles/**" --url http://localhost:3000
```

Keep the app running, let the agent edit it, then finish the checkpoint. PatchOath captures before/after screenshot and DOM evidence, and derives pixel and basic layout differences.

Use the same browser and rendering environment for both captures. Visual differences can be caused by fonts, animation, browser builds, operating systems, and rendering hardware; they do not establish semantic correctness.

## Record review and choose disclosure

After inspecting the captured effect, record a historical conclusion:

```bash
patchoath review --needs-follow-up --note "Routing changes need a dedicated review"
```

Or record acceptance of that exact historical effect:

```bash
patchoath review --accept-effect --reviewer "Alice"
```

Neither command changes the original authority or grants permission for a future patch. The reviewer label is not identity authentication.

Generate a smaller artifact when the recipient does not need a full local report:

```bash
patchoath capsule --json
```

The default capsule omits prompt text, changed paths, full contract patterns, Git patches, and screenshot bytes. Read [Disclosure boundary](disclosure-boundary.md) before adding expanded disclosure flags.

## Common questions

**Why is my screenshot missing?** Screenshots require `--url` when starting the checkpoint, the optional Playwright tooling and browser, and a page reachable during both captures. Git-only checkpoints intentionally have no visual evidence.

**Why was a rename flagged?** Moving a protected source file still touches its original path. Both endpoints must satisfy the contract; a new destination does not erase the original boundary.

**Why are submodule edits blocked?** A parent Git snapshot contains submodule commit pointers, not uncommitted files inside them. Commit or discard those edits before capturing the parent repository. Committed pointer changes are included in diff evidence.

**Does PatchOath include ignored files?** Git-ignored contents are outside the ordinary Git snapshot. Coverage diagnostics record only the number of ignored roots reported by Git and a SHA-256 digest of that root set; they do not store the ignored path names or capture those contents. The digest cannot prove the contents were unchanged, and current Evidence Receipts do not bind this metadata. Coverage fields describe which tracked and non-ignored untracked content is eligible for capture; `patchoath diff --scope staged` or `--scope unstaged` still selects only its requested scope. Do not treat a verified checkpoint as proof that every local file was captured.

**Can I go back?** `patchoath restore` previews a restore. `patchoath restore --apply` applies only after checking for later worktree drift and preserves `HEAD` and the real index. Start with the preview and inspect the result.

**Does a valid receipt mean the code is safe?** No. It checks deterministic evidence consistency within the receipt's versioned coverage. It does not prove authorship, identity, semantic correctness, or a trustworthy machine.

For a bug, include a minimal reproduction and your Node, Git, and operating-system versions. Keep sensitive evidence out of public issues; use the [security policy](../SECURITY.md) for vulnerabilities.
