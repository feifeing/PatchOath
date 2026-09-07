import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  appendCheckpointToSession,
  initializeStore,
  loadSession,
  loadStore,
  saveState,
  storePaths,
} from "../src/core/store.mjs";
import { createRepository } from "../test-support/helpers.mjs";

async function repository(context) {
  const root = await createRepository();
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("store initialization rejects an unsupported config schema before use", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  await writeJson(initialized.paths.config, {
    ...initialized.config,
    schemaVersion: 999,
  });

  await assert.rejects(
    initializeStore(root),
    /Invalid config: schemaVersion must be 1/iu,
  );
});

test("store initialization rejects a path-like current session key", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  await writeJson(initialized.paths.config, {
    ...initialized.config,
    currentSessionId: "../outside-session",
  });

  await assert.rejects(
    initializeStore(root),
    /Invalid config:.*currentSessionId/iu,
  );
});

test("loadStore rejects an unsafe active checkpoint identifier", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  await writeJson(initialized.paths.state, {
    schemaVersion: 1,
    activeCheckpointId: "../po_outside",
  });

  await assert.rejects(loadStore(root), /Invalid state:.*activeCheckpointId/iu);
});

test("saveState validates before replacing the persisted state", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  const before = await readFile(initialized.paths.state, "utf8");

  await assert.rejects(
    saveState(root, {
      schemaVersion: 1,
      activeCheckpointId: "../../po_outside",
    }),
    /Invalid state:.*activeCheckpointId/iu,
  );

  assert.equal(await readFile(initialized.paths.state, "utf8"), before);
});

test("session loading rejects malformed checkpoint collections", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  const sessionPath = join(
    storePaths(root).sessions,
    `${initialized.config.currentSessionId}.json`,
  );
  await writeJson(sessionPath, {
    schemaVersion: 1,
    id: initialized.config.currentSessionId,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    checkpoints: "po_not_an_array",
  });

  await assert.rejects(
    loadSession(root, initialized.config.currentSessionId),
    /Invalid session: checkpoints must be an array/iu,
  );
});

test("session mutation fails closed on malicious checkpoint references", async (context) => {
  const root = await repository(context);
  const initialized = await initializeStore(root);
  const sessionPath = join(
    storePaths(root).sessions,
    `${initialized.config.currentSessionId}.json`,
  );
  const malicious = {
    schemaVersion: 1,
    id: initialized.config.currentSessionId,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    checkpoints: ["../po_outside"],
  };
  await writeJson(sessionPath, malicious);
  const before = await readFile(sessionPath, "utf8");

  await assert.rejects(
    appendCheckpointToSession(
      root,
      initialized.config.currentSessionId,
      "po_safe_append",
    ),
    /Invalid session:.*checkpoints may contain/iu,
  );

  assert.equal(await readFile(sessionPath, "utf8"), before);
});
