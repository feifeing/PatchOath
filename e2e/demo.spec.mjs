import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const RETIRED_PRODUCT_NAME = ["Vibe", "Trace"].join("");
const RETIRED_CLI_PREFIX = ["vibe", "trace "].join("");

test("PatchOath replays authority, review, and disclosure evidence", async ({
  page,
}) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByText("PatchOath", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Declare the boundary\. Inspect the patch\. Prove what crossed it\./u,
    }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(RETIRED_PRODUCT_NAME);
  await expect(page.locator("body")).not.toContainText(RETIRED_CLI_PREFIX);
  await expect(page.locator(".timeline-item")).toHaveCount(3);
  await expect(page.locator("#blastScore")).toHaveText("92");
  await expect(page.locator("#mismatch")).toContainText("INTENT MISMATCH");
  await expect(page.locator(".authorization-section")).toContainText(
    "WHAT YOU AUTHORIZED",
  );
  await expect(page.locator(".authorization-section")).toContainText(
    "DENY PATHS",
  );
  await expect(page.locator(".authorization-section")).toContainText(
    "PROTECTED SURFACES",
  );
  await expect(page.locator(".authorization-section")).toContainText(
    "AUTHORIZATION DRIFT",
  );
  await expect(page.locator(".receipt-chip")).toContainText("EVIDENCE RECEIPT");
  await expect(page.locator(".receipt-chip code")).toContainText("poe_");

  await expect(page.locator("#reviewPlane")).toContainText(
    "REVIEW CONTROL PLANE",
  );
  await expect(page.locator(".review-state")).toHaveText("HUMAN REVIEW");
  await expect(page.locator(".decision-card")).toContainText(
    "protected-path-requires-human-review",
  );
  await expect(page.locator(".trust-card")).toContainText(
    "recomputed from objects",
  );
  await expect(page.locator(".trust-card")).toContainText("effect-manifest-v2");
  await expect(page.locator(".trust-card .review-receipt code")).toContainText(
    "pocd_",
  );
  await expect(page.locator(".disclosure-card")).toContainText(
    "This browser report is not a share-safe Capsule.",
  );
  await expect(page.locator(".disclosure-card")).toContainText("promptText");
  await expect(page.locator(".disclosure-card")).toContainText(
    "DISCLOSURE RECEIPT",
  );
  await expect(page.locator(".disclosure-receipt code")).toContainText("pod_");
  await expect(page.locator(".historical-review-card")).toContainText(
    "Historical effect review",
  );
  await expect(page.locator(".historical-review-card")).toContainText(
    "FOLLOW-UP",
  );
  await expect(page.locator(".historical-review-card")).toContainText(
    "Future authority unchanged",
  );
  await expect(page.locator(".historical-review-card")).toContainText(
    "identity not verified",
  );
  await expect(page.locator(".historical-review-card")).toContainText("por_");
  await expect(
    page.locator(".historical-review-card button:not([data-history-copy])"),
  ).toHaveCount(0);

  await page.locator(".timeline-item").nth(1).click();
  await expect(page.locator("#evidence-title")).toContainText("cinematic");
  await expect(page.locator("#blastScore")).toHaveText("38");
  await expect(page.locator(".contract-status")).toHaveText("ALIGNED");
  await expect(page.locator(".authorization-section")).toContainText(
    "AUTHORIZED SCOPE HELD",
  );
  await expect(page.locator(".review-state")).toHaveText("ALIGNED");
  await expect(page.locator(".decision-card")).toContainText(
    "No path grant needed",
  );
  await expect(page.locator(".trust-card")).toContainText("compliant");
  await expect(page.locator(".historical-review-card")).toContainText(
    "ACCEPTED EFFECT",
  );
  await expect(page.locator(".historical-review-card")).toContainText(
    "Accepted for this captured effect only.",
  );
  await expect(page.locator(".historical-review-card")).toContainText(
    "Future authority unchanged",
  );

  await page.locator('[data-view="diff"]').click();
  await expect(page.locator("#visualStage")).toHaveAttribute(
    "data-view",
    "diff",
  );
  await expect(page.locator("#diffFrame")).toBeVisible();

  await page.locator('[data-view="wipe"]').click();
  await page.locator("#compareSlider").fill("67");
  await expect(page.locator("#afterFrame")).toHaveAttribute("style", /67%/u);
  expect(consoleErrors).toEqual([]);
});

test("PatchOath mobile layout has no page-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("PatchOath", { exact: true })).toBeVisible();
  await expect(page.locator("#visualStage")).toBeVisible();
  await expect(page.locator("#reviewPlane")).toBeVisible();
  await expect(page.locator(".historical-review-card")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/patchoath-mobile.png",
    fullPage: true,
  });
});

test("capture the PatchOath dashboard at a real desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/");
  await expect(page.getByText("PatchOath", { exact: true })).toBeVisible();
  await expect(page.locator(".historical-review-card")).toBeVisible();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/patchoath-dashboard.png",
    fullPage: true,
  });
});
