import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "patchoath-test-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "PatchOath Test"]);
  git(root, ["config", "user.email", "test@patchoath.local"]);
  await writeFile(join(root, "app.js"), "export const value = 1;\n", "utf8");
  git(root, ["add", "app.js"]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

export function memoryStream() {
  let value = "";
  return {
    isTTY: false,
    write(chunk) {
      value += String(chunk);
    },
    value() {
      return value;
    },
  };
}
