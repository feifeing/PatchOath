#!/usr/bin/env node

process.stderr.write(
  "warning `vibetrace` is the legacy command name. Use `patchoath` instead; legacy compatibility may be removed in a future major release.\n",
);
await import("./patchoath.mjs");
