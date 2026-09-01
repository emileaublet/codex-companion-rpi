import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexRpcClient } from "../packages/codex-rpc-client.mjs";

const fakeServer = `#!/usr/bin/env node
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { platformFamily: "unix" } }) + "\\n");
  }
  if (message.method === "thread/list") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { data: [
      { id: "thr_new", name: "Newest", preview: "Latest work", updatedAt: 3 },
      { id: "thr_old", name: "Older", preview: "Earlier work", updatedAt: 1 }
    ] } }) + "\\n");
  }
}
`;

test("CodexRpcClient initializes app-server and lists threads", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "companion-codex-test-"));
  const executable = path.join(directory, "fake-codex");
  await writeFile(executable, fakeServer);
  await chmod(executable, 0o755);

  const client = new CodexRpcClient(executable);
  context.after(() => client.close());
  const threads = await client.recentThreads(3);

  assert.equal(threads.length, 2);
  assert.equal(threads[0].id, "thr_new");
});
