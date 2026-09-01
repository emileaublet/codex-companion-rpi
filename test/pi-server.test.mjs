import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function startServer(port) {
  const child = spawn(process.execPath, ["apps/pi/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), MOCK_MODE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Pi server did not start")), 5_000);
    child.once("error", reject);
    child.stdout.once("data", () => {
      clearTimeout(timeout);
      resolve(child);
    });
  });
}

test("Pi server serves the kiosk and exactly three mock thread cards", async (context) => {
  const port = 43173;
  const child = await startServer(port);
  context.after(() => child.kill("SIGTERM"));

  const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, mockMode: true });

  const html = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.text());
  assert.match(html, /Codex Companion/);
  assert.match(html, /id="thread-list"/);

  const payload = await fetch(`http://127.0.0.1:${port}/api/threads`).then((response) => response.json());
  assert.equal(payload.threads.length, 3);
  assert.equal(payload.source, "mock");
});
