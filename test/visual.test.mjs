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

test("visual comparison rejects an input outside the diff artifact directory", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-visual-contained-"));
  const outside = await mkdtemp(join(tmpdir(), "patchoath-visual-outside-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const beforePath = join(outside, "before.png");
  const afterPath = join(root, "after.png");
  const diffPath = join(root, "diff.png");
  await writeFile(beforePath, image([0, 0, 0]));
  await writeFile(afterPath, image([255, 255, 255]));

  await assert.rejects(
    compareVisualCaptures({
      before: {
        image: beforePath,
        dom: { hash: "a", nodeCount: 1 },
        layout: [],
      },
      after: {
        image: afterPath,
        dom: { hash: "b", nodeCount: 1 },
        layout: [],
      },
      diffOutputPath: diffPath,
    }),
    /Visual comparison input escapes its managed directory/iu,
  );
});

test("visual comparison rejects a symlink input even when its path is inside the artifact directory", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-visual-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "patchoath-visual-target-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  context.after(() => rm(outside, { recursive: true, force: true }));
  const target = join(outside, "before.png");
  const beforePath = join(root, "before.png");
  const afterPath = join(root, "after.png");
  const diffPath = join(root, "diff.png");
  await writeFile(target, image([0, 0, 0]));
  await symlink(target, beforePath);
  await writeFile(afterPath, image([255, 255, 255]));

  await assert.rejects(
    compareVisualCaptures({
      before: {
        image: beforePath,
        dom: { hash: "a", nodeCount: 1 },
        layout: [],
      },
      after: {
        image: afterPath,
        dom: { hash: "b", nodeCount: 1 },
        layout: [],
      },
      diffOutputPath: diffPath,
    }),
    /Visual comparison input must not be a symbolic link/iu,
  );
});
