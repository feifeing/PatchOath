import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function loadPng() {
  try {
    return await import("pngjs");
  } catch {
    throw new Error(
      "Pixel comparison needs the optional `pngjs` package. Run `npm install --save-dev pngjs`.",
    );
  }
}

function compareLayout(before = [], after = [], tolerance = 2) {
  const beforeByKey = new Map(before.map((item) => [item.key, item]));
  const afterByKey = new Map(after.map((item) => [item.key, item]));
  const added = [...afterByKey.keys()].filter((key) => !beforeByKey.has(key));
  const removed = [...beforeByKey.keys()].filter((key) => !afterByKey.has(key));
  const movedOrResized = [];

  for (const [key, beforeItem] of beforeByKey) {
    const afterItem = afterByKey.get(key);
    if (!afterItem) continue;
    const delta = {
      x: afterItem.x - beforeItem.x,
      y: afterItem.y - beforeItem.y,
      width: afterItem.width - beforeItem.width,
      height: afterItem.height - beforeItem.height,
    };
    if (Object.values(delta).some((value) => Math.abs(value) > tolerance)) {
      movedOrResized.push({ key, delta });
    }
  }

  return {
    supported: true,
    tolerancePixels: tolerance,
    changed:
      added.length > 0 || removed.length > 0 || movedOrResized.length > 0,
    addedCount: added.length,
    removedCount: removed.length,
    movedOrResizedCount: movedOrResized.length,
    comparedCount: Math.min(beforeByKey.size, afterByKey.size),
    examples: {
      added: added.slice(0, 5),
      removed: removed.slice(0, 5),
      movedOrResized: movedOrResized.slice(0, 5),
    },
  };
}

export async function compareVisualCaptures({
  before,
  after,
  diffOutputPath,
  colorThreshold = 24,
}) {
  const { PNG } = await loadPng();
  const beforePng = PNG.sync.read(await readFile(before.image));
  const afterPng = PNG.sync.read(await readFile(after.image));
  const width = Math.max(beforePng.width, afterPng.width);
  const height = Math.max(beforePng.height, afterPng.height);
  const totalPixels = width * height;
  let changedPixels = 0;
  const diff = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      const beforeInside = x < beforePng.width && y < beforePng.height;
      const afterInside = x < afterPng.width && y < afterPng.height;
      const beforeIndex = (y * beforePng.width + x) * 4;
      const afterIndex = (y * afterPng.width + x) * 4;
      const channelDelta =
        beforeInside && afterInside
          ? Math.max(
              Math.abs(beforePng.data[beforeIndex] - afterPng.data[afterIndex]),
              Math.abs(
                beforePng.data[beforeIndex + 1] - afterPng.data[afterIndex + 1],
              ),
              Math.abs(
                beforePng.data[beforeIndex + 2] - afterPng.data[afterIndex + 2],
              ),
              Math.abs(
                beforePng.data[beforeIndex + 3] - afterPng.data[afterIndex + 3],
              ),
            )
          : 255;
      const changed = channelDelta > colorThreshold;
      if (changed) changedPixels += 1;

      if (changed) {
        diff.data[outputIndex] = 255;
        diff.data[outputIndex + 1] = 72;
        diff.data[outputIndex + 2] = 142;
        diff.data[outputIndex + 3] = 255;
      } else {
        const source = afterInside ? afterPng.data : beforePng.data;
        const sourceIndex = afterInside ? afterIndex : beforeIndex;
        const gray = Math.round(
          (source[sourceIndex] +
            source[sourceIndex + 1] +
            source[sourceIndex + 2]) /
            3,
        );
        diff.data[outputIndex] = gray;
        diff.data[outputIndex + 1] = gray;
        diff.data[outputIndex + 2] = gray;
        diff.data[outputIndex + 3] = 100;
      }
    }
  }

  await mkdir(dirname(diffOutputPath), { recursive: true });
  await writeFile(diffOutputPath, PNG.sync.write(diff));

  return {
    pixel: {
      supported: true,
      method: "absolute-rgba-threshold",
      colorThreshold,
      changedPixels,
      totalPixels,
      differenceRatio: totalPixels === 0 ? 0 : changedPixels / totalPixels,
      dimensionsMatch:
        beforePng.width === afterPng.width &&
        beforePng.height === afterPng.height,
      beforeSize: { width: beforePng.width, height: beforePng.height },
      afterSize: { width: afterPng.width, height: afterPng.height },
      diffImage: diffOutputPath,
    },
    layout: compareLayout(before.layout, after.layout),
    dom: {
      supported: true,
      changed: before.dom.hash !== after.dom.hash,
      beforeHash: before.dom.hash,
      afterHash: after.dom.hash,
      nodeDelta: after.dom.nodeCount - before.dom.nodeCount,
    },
    semantic: {
      supported: false,
      reason:
        "PatchOath v0.3 does not infer whether a visual or DOM change is semantically correct.",
    },
  };
}
