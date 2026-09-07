import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { LEGACY_REVIEW_RECORD_PREFIX, REVIEW_RECORD_PREFIX } from "./brand.mjs";
import { readManagedFile, writeManagedFileAtomic } from "./managed-file.mjs";
import { ensurePhysicalDirectory } from "./store-boundary.mjs";
import {
  assertPrefixedStorageId,
  storageIdFromJsonFilename,
} from "./storage-key.mjs";
import { ensureStoreBoundary, storePaths } from "./store.mjs";

const REVIEW_PREFIXES = [REVIEW_RECORD_PREFIX, LEGACY_REVIEW_RECORD_PREFIX];

export function historicalReviewDirectory(root) {
  return storePaths(root).reviews;
}

async function prepareHistoricalReviewDirectory(root, create) {
  const boundary = await ensureStoreBoundary(root, { create });
  if (!boundary.exists)
    return { exists: false, directory: boundary.paths.reviews };
  const result = await ensurePhysicalDirectory(
    boundary.paths.directory,
    boundary.paths.reviews,
    "Historical review store directory",
    { create },
  );
  return { exists: result.exists, directory: boundary.paths.reviews };
}

export async function saveHistoricalEffectReview(root, record) {
  assertPrefixedStorageId(
    record?.recordId,
    REVIEW_PREFIXES,
    "review record ID",
  );
  const { directory } = await prepareHistoricalReviewDirectory(root, true);
  const path = join(directory, `${record.recordId}.json`);
  await writeManagedFileAtomic(path, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    label: "Historical review record",
  });
  return path;
}

export async function listHistoricalEffectReviews(root) {
  const prepared = await prepareHistoricalReviewDirectory(root, false);
  if (!prepared.exists) return [];
  const directory = prepared.directory;
  let names = [];
  try {
    names = (await readdir(directory)).filter((name) =>
      Boolean(storageIdFromJsonFilename(name, REVIEW_PREFIXES)),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const records = await Promise.all(
    names.map(async (name) => {
      const source = await readManagedFile(join(directory, name), {
        encoding: "utf8",
        label: "Historical review record",
        within: directory,
      });
      return JSON.parse(source);
    }),
  );
  return records.sort((left, right) =>
    String(right.recordedAt).localeCompare(String(left.recordedAt)),
  );
}
