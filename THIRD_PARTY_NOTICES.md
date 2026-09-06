# Third-party software notices

PatchOath is distributed under the MIT License in [`LICENSE`](LICENSE). This file records third-party software used by the current repository so release and contribution reviews have an inspectable baseline.

The current package does **not** bundle `node_modules` or browser binaries. The packages below are development or optional local tooling resolved through npm. Their upstream licenses remain their own.

| Component                                             | Current role                                                        | License    | Upstream                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ---------- | --------------------------------------- |
| `@playwright/test` / `playwright` / `playwright-core` | Browser E2E tests and optional visual capture                       | Apache-2.0 | https://github.com/microsoft/playwright |
| `pngjs`                                               | Optional PNG decoding and pixel-difference generation               | MIT        | https://github.com/pngjs/pngjs          |
| `prettier`                                            | Development formatting                                              | MIT        | https://github.com/prettier/prettier    |
| `fsevents`                                            | Optional transitive dependency used by development tooling on macOS | MIT        | https://github.com/fsevents/fsevents    |

## Browser binaries

`npx playwright install chromium` downloads browser software separately from this repository. Browser binaries are not authored by PatchOath and may contain components governed by their own licenses, notices, and redistribution terms. PatchOath's MIT License does not relicense those binaries.

## Project-owned assets

The PatchOath vector mark and Dashboard interface assets maintained in this repository are project-authored assets unless an asset-specific provenance entry states otherwise. See [`docs/asset-provenance.md`](docs/asset-provenance.md).

## Release rule

Adding a dependency, vendored source file, copied example, icon, font, image, dataset, browser binary, or other redistributed third-party material requires a source-and-license review before merge. Update this notice when the reviewed third-party baseline changes.

The automated rights check intentionally treats an unknown package license, bundled font, or remote Dashboard asset as a review event rather than silently assuming compatibility.
