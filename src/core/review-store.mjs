import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LEGACY_REVIEW_RECORD_PREFIX,
  REVIEW_RECORD_PREFIX,
} from "./brand.mjs";
import {
  assertPrefixedStorageId,
  storageIdFromJsonFilename,
} from "./storage-key.mjs";
import { storePaths } from "./store.mjs";

const REVIEW_PREFIXES = [REVIEW_RECORD_PREFIX, LEGACY_REVIEW_RECORD_PREFIX];

export function historicalReviewDirectory(root) {
  return join(storePaths(root).directory, "reviews");
}

export async function saveHistoricalEffectReview(root, record) {
  assertPrefixedStorageId(record?.recordId, REVIEW_PREFIXES, "review record ID");
  const directory = historicalReviewDirectory(root);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${record.recordId}.json`);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  return path;
}

export async function listHistoricalEffectReviews(root) {
  const directory = historicalReviewDirectory(root);
  let names = [];
  try {
    names = (await readdir(directory)).filter((name) =>
      Boolean(storageIdFromJsonFilename(name, REVIEW_PREFIXES)),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const records = await Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(join(directory, name), "utf8")),
    ),
  );
  return records.sort((left, right) =>
    String(right.recordedAt).localeCompare(String(left.recordedAt)),
  );
}
