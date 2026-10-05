import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { listCheckpoints } from "../src/core/store.mjs";
import { generateReport } from "../src/report/generate.mjs";
import { createRepository } from "../test-support/helpers.mjs";

test("generated reports run directly from a local file with every review panel", async ({
  page,
}) => {
  const root = await createRepository();
  try {
    await writeFile(join(root, "app.js"), "export const value = 2;\n");
    const prompt = "Review the generated standalone report";
    execFileSync(
      process.execPath,
      [
        resolve("bin/patchoath.mjs"),
        "checkpoint",
        "--prompt",
        prompt,
        "--from-head",
      ],
      { cwd: root },
    );
    const checkpoints = await listCheckpoints(root);
    const report = await generateReport(root, checkpoints, checkpoints[0].id);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(pathToFileURL(report.index).href);
    await expect(page.locator("#evidence-title")).toHaveText(prompt);
    await expect(page.locator(".authorization-section")).toBeVisible();
    await expect(page.locator(".trust-card")).toContainText("verified");
    await expect(page.locator(".historical-review-card")).toBeVisible();
    await expect(page.locator("#sessionMode")).toHaveText(
      "LOCAL REPORT · 1 CHECKPOINT",
    );
    await expect(page.locator("#get-started")).toBeHidden();
    await expect(page.locator("#demoHint")).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

test("an empty report never falls back to sample evidence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__PATCHOATH_REPORT__ = { mode: "report", checkpoints: [] };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#sessionMode")).toHaveText(
    "LOCAL REPORT · 0 CHECKPOINTS",
  );
  await expect(page.locator(".workspace-heading h2")).toHaveText(
    "No captured checkpoints in this report.",
  );
  await expect(page.locator(".timeline-item")).toHaveCount(0);
  await expect(page.locator("#get-started")).toBeHidden();
  expect(errors).toEqual([]);
});

test("report metric values render as text even when stored evidence contains HTML", async ({
  page,
}) => {
  const payload =
    '<img src="/missing-metric" onerror="window.metricInjection=true">';
  const checkpoint = {
    id: "po_untrusted_metrics",
    createdAt: "2026-10-05T00:00:00Z",
    prompt: { text: "Inspect malformed evidence" },
    analysis: {
      summary: { filesChanged: payload, modulesChanged: 1 },
      blastRadius: {
        score: payload,
        level: "contained",
        modules: [],
        sensitiveAreas: [],
        intentMismatch: {
          detected: false,
          explanation: "Inspect this evidence manually.",
        },
      },
      risk: {
        score: 1,
        level: "low",
        factors: [{ label: "Untrusted metric", points: payload }],
      },
      files: [
        { path: "app.js", additions: payload, deletions: payload, signals: [] },
      ],
      visual: {
        pixel: { differenceRatio: 0, changedPixels: payload },
        layout: { supported: true, movedOrResizedCount: payload },
        dom: { supported: true, changed: false, nodeDelta: payload },
      },
    },
  };
  await page.addInitScript((record) => {
    window.__PATCHOATH_REPORT__ = {
      mode: "report",
      selectedId: record.id,
      checkpoints: [record],
    };
  }, checkpoint);
  await page.goto("/");
  await expect(page.locator("#evidence-title")).toHaveText(
    checkpoint.prompt.text,
  );
  await expect(page.locator(".timeline-meta")).toContainText(payload);
  await expect(page.locator(".file-row")).toContainText(payload);
  await expect(page.locator(".evidence-stat").nth(1)).toContainText(payload);
  await expect(page.locator('img[src="/missing-metric"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.metricInjection)).toBeUndefined();
});
