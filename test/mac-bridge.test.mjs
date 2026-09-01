import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fakeCodex = `#!/usr/bin/env node
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { codexHome: "/private", platformFamily: "unix", platformOs: "macos", userAgent: "test" } }) + "\\n");
  }
  if (message.method === "thread/list") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { data: [
      { id: "new", name: "Newest", preview: "Review <b>safe</b> work", updatedAt: 3, status: { type: "active", activeFlags: [] } },
      { id: "mid", name: "Middle", preview: "Bearer should-not-leak", updatedAt: 2, status: { type: "idle" } },
      { id: "old", name: "Old", preview: "/Users/emile/private.txt", updatedAt: 1, status: { type: "idle" } },
      { id: "extra", name: "Extra", preview: "not returned", updatedAt: 0, status: { type: "idle" } }
    ] } }) + "\\n");
  }
}
`;

function waitForListening(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("bridge did not start")), 5_000);
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

test("Mac bridge authenticates and returns exactly three sanitized cards", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "companion-bridge-test-"));
  const executable = path.join(directory, "fake-codex");
  const tokenFile = path.join(directory, "bridge.token");
  const testToken = ["test", "token", "that", "is", "long", "enough", "1234567890"].join("-");
  await writeFile(executable, fakeCodex);
  await chmod(executable, 0o755);
  await writeFile(tokenFile, `${testToken}\n`);

  const port = 44174;
  const child = spawn(process.execPath, ["apps/mac-bridge/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      BRIDGE_HOST: "127.0.0.1",
      BRIDGE_PORT: String(port),
      BRIDGE_TOKEN_FILE: tokenFile,
      CODEX_BIN: executable
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  context.after(() => child.kill("SIGTERM"));
  await waitForListening(child);

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);

  const unauthorized = await fetch(`http://127.0.0.1:${port}/api/threads`);
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`http://127.0.0.1:${port}/api/threads`, {
    headers: { authorization: `Bearer ${testToken}` }
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const payload = JSON.parse(body);
  assert.equal(payload.threads.length, 3);
  assert.equal(payload.threads[0].title, "Newest");
  assert.doesNotMatch(body, /turns|Bearer should-not-leak|\/Users|private\.txt|secret/);
});
