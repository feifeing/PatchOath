import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

function capture(imagePath, hash, nodeCount, y) {
  return {
    image: imagePath,
    dom: { hash, nodeCount },
    layout: [{ key: "#hero", x: 0, y, width: 10, height: 10 }],
  };
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
    before: capture(beforePath, "a", 1, 0),
    after: capture(afterPath, "b", 2, 5),
    diffOutputPath: diffPath,
  });

  assert.equal(result.pixel.differenceRatio, 1);
  assert.equal(result.layout.movedOrResizedCount, 1);
  assert.equal(result.dom.changed, true);
  assert.equal(result.semantic.supported, false);
  assert.ok((await readFile(diffPath)).length > 0);
});

test("visual comparison refuses a symlinked diff artifact target", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-visual-symlink-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const beforePath = join(root, "before.png");
  const afterPath = join(root, "after.png");
  const diffPath = join(root, "diff.png");
  const outside = join(root, "outside.png");
  await writeFile(beforePath, image([0, 0, 0]));
  await writeFile(afterPath, image([255, 255, 255]));
  await writeFile(outside, "sentinel", "utf8");
  await symlink(outside, diffPath);

  await assert.rejects(
    compareVisualCaptures({
      before: capture(beforePath, "a", 1, 0),
      after: capture(afterPath, "b", 2, 5),
      diffOutputPath: diffPath,
    }),
    /Visual diff artifact file must not be a symbolic link/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "sentinel");
});
