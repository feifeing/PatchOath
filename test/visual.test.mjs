import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { compareVisualCaptures } from "../src/visual/compare.mjs";

function image(color) {
  const png = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("visual comparison reports honest pixel, layout, DOM, and semantic layers", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-visual-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const beforePath = join(root, "before.png");
  const afterPath = join(root, "after.png");
  const diffPath = join(root, "diff.png");
  await writeFile(beforePath, image([0, 0, 0]));
  await writeFile(afterPath, image([255, 255, 255]));

  const result = await compareVisualCaptures({
    before: {
      image: beforePath,
      dom: { hash: "a", nodeCount: 1 },
      layout: [{ key: "#hero", x: 0, y: 0, width: 10, height: 10 }],
    },
    after: {
      image: afterPath,
      dom: { hash: "b", nodeCount: 2 },
      layout: [{ key: "#hero", x: 0, y: 5, width: 10, height: 10 }],
    },
    diffOutputPath: diffPath,
  });

  assert.equal(result.pixel.differenceRatio, 1);
  assert.equal(result.layout.movedOrResizedCount, 1);
  assert.equal(result.dom.changed, true);
  assert.equal(result.semantic.supported, false);
  assert.ok((await readFile(diffPath)).length > 0);
});
