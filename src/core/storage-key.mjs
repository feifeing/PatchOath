const STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const MAX_STORAGE_SEGMENT_LENGTH = 160;

export function isSafeStorageSegment(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_STORAGE_SEGMENT_LENGTH &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    STORAGE_SEGMENT.test(value)
  );
}

export function isPrefixedStorageId(value, prefixes) {
  if (!isSafeStorageSegment(value) || !Array.isArray(prefixes)) return false;
  return prefixes.some(
    (prefix) =>
      typeof prefix === "string" &&
      prefix.length > 0 &&
      value.startsWith(`${prefix}_`),
  );
}

export function assertPrefixedStorageId(value, prefixes, label = "storage ID") {
  if (!isPrefixedStorageId(value, prefixes)) {
    throw new Error(
      `Invalid ${label}: expected a repository-local identifier with prefix ${prefixes
        .map((prefix) => `${prefix}_`)
        .join(" or ")}.`,
    );
  }
  return value;
}

export function storageIdFromJsonFilename(name, prefixes) {
  if (typeof name !== "string" || !name.endsWith(".json")) return null;
  const id = name.slice(0, -5);
  return isPrefixedStorageId(id, prefixes) ? id : null;
}
