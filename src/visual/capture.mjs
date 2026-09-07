import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import {
  publishSafeTemporaryFile,
  reserveSafeTemporaryFile,
} from "../core/safe-file.mjs";

async function loadPlaywright() {
  try {
    return await import("@playwright/test");
  } catch {
    throw new Error(
      "Visual capture needs the optional Playwright adapter. Run `npm install --save-dev @playwright/test pngjs` and `npx playwright install chromium`.",
    );
  }
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid capture URL: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Visual capture only supports http:// or https:// URLs.");
  }
  return url.toString();
}

export async function capturePage({
  url,
  outputPath,
  viewport = { width: 1440, height: 900 },
  waitMs = 350,
}) {
  const { chromium } = await loadPlaywright();
  const normalizedUrl = validateUrl(url);
  const temporaryOutputPath = await reserveSafeTemporaryFile(outputPath);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      colorScheme: "dark",
    });
    await page.goto(normalizedUrl, {
      waitUntil: "networkidle",
      timeout: 20_000,
    });
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation-delay:0s!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important}",
    });
    if (waitMs > 0) await page.waitForTimeout(waitMs);

    const layout = await page.evaluate(() => {
      function selectorFor(element) {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 5) {
          const tag = current.tagName.toLowerCase();
          const siblings = current.parentElement
            ? [...current.parentElement.children].filter(
                (child) => child.tagName === current.tagName,
              )
            : [];
          const position =
            siblings.length > 1
              ? `:nth-of-type(${siblings.indexOf(current) + 1})`
              : "";
          parts.unshift(`${tag}${position}`);
          current = current.parentElement;
        }
        return parts.join(">");
      }

      return [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            key: selectorFor(element),
            tag: element.tagName.toLowerCase(),
            role: element.getAttribute("role"),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              Number(style.opacity) !== 0,
          };
        })
        .filter((item) => item.visible)
        .slice(0, 600);
    });

    const html = await page.content();
    await page.screenshot({
      path: temporaryOutputPath,
      fullPage: true,
      animations: "disabled",
    });
    const imageSha256 = createHash("sha256")
      .update(await readFile(temporaryOutputPath))
      .digest("hex");
    await publishSafeTemporaryFile(
      temporaryOutputPath,
      outputPath,
      "Visual artifact file",
    );

    return {
      url: page.url(),
      title: await page.title(),
      capturedAt: new Date().toISOString(),
      viewport,
      image: outputPath,
      imageSha256,
      dom: {
        hash: createHash("sha256").update(html).digest("hex").slice(0, 20),
        nodeCount: layout.length,
      },
      layout,
      environment: {
        browser: "chromium",
        platform: process.platform,
        deviceScaleFactor: 1,
      },
    };
  } finally {
    await browser.close();
    await rm(temporaryOutputPath, { force: true }).catch(() => {});
  }
}
