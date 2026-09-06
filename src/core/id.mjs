import { randomBytes } from "node:crypto";
import { CHECKPOINT_ID_PREFIX } from "./brand.mjs";

export function createId(prefix = CHECKPOINT_ID_PREFIX) {
  const effectivePrefix = prefix === "vt" ? CHECKPOINT_ID_PREFIX : prefix;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/gu, "")
    .slice(0, 14);
  return `${effectivePrefix}_${stamp}_${randomBytes(3).toString("hex")}`;
}
