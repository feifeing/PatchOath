# Asset provenance

This document records current first-party visual assets and the rules for adding new media.

| Asset                          | Provenance                                                                                  | Notes                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/patchoath-mark.svg`      | Project-authored vector source stored directly in this repository                           | Geometric seal/check mark created for PatchOath; no third-party logo, font, or icon package is embedded.                                                 |
| `docs/vibetrace-dashboard.png` | Generated from the project's own browser demo by `e2e/demo.spec.mjs` before the v0.3 rename | Legacy-named screenshot asset from the earlier interface. It is not copied from another product and must not be used as the final PatchOath launch hero. |
| Inline SVG in `web/index.html` | Project-authored interface glyphs                                                           | The PatchOath seal/check wordmark and other interface glyphs are local SVG paths; no external icon package is bundled.                                   |
| Dashboard CSS visuals          | Project-authored CSS in `web/*.css`                                                         | No remote background image or third-party stylesheet is intentionally loaded.                                                                            |
| Web typography                 | System font fallback stack                                                                  | No `.ttf`, `.otf`, `.woff`, or `.woff2` font file is currently redistributed by the repository.                                                          |

The retired pre-v0.3 vector mark has been removed from the current tree rather than retained as a reusable asset. Its history remains available through Git if provenance review is ever needed.

This provenance record is an engineering record, not a trademark-clearance opinion. A first-party asset can still require separate mark/name review before material commercial use.

## Brand migration rule

New launch material should use `docs/patchoath-mark.svg` and a tested PatchOath Dashboard capture. Retired-brand assets may remain in Git history or explicit migration documentation, but they should not be reintroduced into new marketing surfaces.

The current legacy dashboard PNG should be replaced by a freshly generated PatchOath screenshot only after the v0.3 browser suite passes, so the public screenshot reflects tested current UI rather than a manually composed mockup.

## Adding assets

Before adding an image, screenshot, logo, icon set, font, video, dataset, template, or other media:

1. record whether it is original, generated from project-owned material, licensed, or used with permission;
2. if third-party, record the source and applicable license/permission;
3. preserve any required attribution or notice;
4. do not use third-party product logos merely to make compatibility claims more visually prominent;
5. do not commit screenshots containing confidential repositories, personal data, credentials, or material the contributor is not authorized to publish; and
6. review whether the asset creates a new external request or telemetry/data-flow surface.

The CI rights check rejects bundled font binaries and remote Dashboard assets until their redistribution/data-flow implications are deliberately reviewed and the gate is updated.
