import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "apps/pi/server.mjs",
  "apps/pi/public/index.html",
  "apps/pi/public/styles.css",
  "apps/pi/public/app.js",
  "apps/pi/epaper-renderer.mjs",
  "apps/mac-bridge/server.mjs",
  "packages/epaper-frame.mjs",
  "firmware/epaper-esp32/platformio.ini",
  "firmware/epaper-esp32/src/main.cpp",
  "firmware/epaper-esp32/README.md",
  "packages/codex-rpc-client.mjs",
  "packages/thread-view.mjs",
  "scripts/update.sh",
  "deploy/systemd/codex-companion.service",
  "deploy/systemd/codex-companion-epaper.service",
  "deploy/systemd/codex-companion-update.service",
  "deploy/systemd/codex-companion-update.timer",
  "deploy/autostart/codex-companion.desktop"
];

const shellScripts = [
  "scripts/install-mac.sh",
  "scripts/install-pi.sh",
  "scripts/launch-kiosk.sh",
  "scripts/update.sh"
];

const javascriptFiles = [
  "apps/pi/server.mjs",
  "apps/pi/public/app.js",
  "apps/mac-bridge/server.mjs",
  "packages/codex-rpc-client.mjs",
  "packages/thread-view.mjs",
  "scripts/verify.mjs"
];

for (const file of required) await access(path.join(root, file));

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

for (const file of shellScripts) {
  await access(path.join(root, file));
  const result = spawnSync("bash", ["-n", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const tests = spawnSync(process.execPath, ["--test"], { cwd: root, stdio: "inherit" });
process.exit(tests.status || 0);
