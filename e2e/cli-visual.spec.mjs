import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const cli = resolve("bin/patchoath.mjs");
test.setTimeout(60_000);

function run(root, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const { port } = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process may still be binding its port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Test server did not start: ${url}`);
}

test("PatchOath captures and compares a real before/after page", async () => {
  const root = await mkdtemp(join(tmpdir(), "patchoath-e2e-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const serverSource = `import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';createServer(async(_q,r)=>{r.setHeader('content-type','text/html');r.end(await readFile(new URL('./index.html',import.meta.url)))}).listen(${port},'127.0.0.1');`;
  await writeFile(join(root, "server.mjs"), serverSource, "utf8");
  await writeFile(
    join(root, "index.html"),
    '<main style="width:100vw;height:100vh;background:#24144d"></main>',
    "utf8",
  );
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "PatchOath E2E"], { cwd: root });
  execFileSync("git", ["config", "user.email", "e2e@patchoath.local"], {
    cwd: root,
  });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    stdio: "ignore",
  });

  try {
    await waitForServer(url);
    run(root, [
      "checkpoint",
      "--prompt",
      "Change the page color",
      "--url",
      url,
      "--viewport",
      "800x600",
      "--wait",
      "0",
    ]);
    await writeFile(
      join(root, "index.html"),
      '<main style="width:100vw;height:100vh;background:#c8ff66"></main>',
      "utf8",
    );
    run(root, ["checkpoint", "--finish"]);
    const checkpointDirectory = join(root, ".patchoath", "checkpoints");
    const checkpointNames = await readdir(checkpointDirectory);
    const checkpoint = JSON.parse(
      await readFile(join(checkpointDirectory, checkpointNames[0]), "utf8"),
    );
    expect(checkpoint.id).toMatch(/^po_/u);
    expect(checkpoint.receipt.receiptId).toMatch(/^poe_[a-f0-9]{24}$/u);
    expect(checkpoint.before.ref).toMatch(/^refs\/patchoath\//u);
    expect(checkpoint.after.ref).toMatch(/^refs\/patchoath\//u);
    expect(checkpoint.analysis.visual.pixel.differenceRatio).toBeGreaterThan(
      0.5,
    );
    expect(checkpoint.analysis.visual.layout.supported).toBe(true);
    expect(checkpoint.analysis.visual.semantic.supported).toBe(false);
    expect(checkpoint.visual.before.image).not.toMatch(/^\//u);
  } finally {
    server.kill("SIGTERM");
    await rm(root, { recursive: true, force: true });
  }
});
