// A rename removes its source and adds its destination. A copy leaves its source intact.
export function changedPaths(file) {
  return [
    ...new Set(
      (file.status === "renamed" && file.oldPath
        ? [file.oldPath, file.path]
        : [file.path]
      ).map((path) => path.replaceAll("\\", "/")),
    ),
  ];
}
