import { open } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { EPAPER_FRAME_BYTES, frameDigest, renderEpaperFrame } from "../../packages/epaper-frame.mjs";

const companionUrl = (process.env.COMPANION_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const devicePath = process.env.EPAPER_SERIAL_DEVICE || "/dev/ttyACM0";
const intervalMs = Math.max(30_000, Number(process.env.EPAPER_UPDATE_INTERVAL_MS || 60_000));
const protocolVersion = "CCEP/1";
let serial;
let lastDigest = "";

function configureSerial() {
  const result = spawnSync("stty", ["-F", devicePath, "115200", "raw", "-echo", "-ixon", "-ixoff"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("serial configuration failed");
}

async function openSerial() {
  if (serial) return serial;
  configureSerial();
  serial = await open(devicePath, "r+");
  // Opening a USB serial handle can toggle DTR and reset the ESP32.
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  return serial;
}

async function sendFrame(frame) {
  if (frame.length !== EPAPER_FRAME_BYTES) throw new Error("invalid ePaper frame size");
  const handle = await openSerial();
  const header = Buffer.from(`${protocolVersion} ${frame.length}\n`, "ascii");
  await handle.write(header);
  await handle.write(frame);
}

async function fetchPayload() {
  const response = await fetch(`${companionUrl}/api/threads`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`companion unavailable (${response.status})`);
  return response.json();
}

async function refresh() {
  let payload;
  try {
    payload = await fetchPayload();
  } catch {
    payload = { threads: [], offline: true };
  }

  const frame = renderEpaperFrame(payload);
  const digest = frameDigest(frame);
  if (digest === lastDigest) return;

  try {
    await sendFrame(frame);
    lastDigest = digest;
    console.log(`ePaper frame sent (${digest.slice(0, 12)})`);
  } catch {
    if (serial) await serial.close().catch(() => {});
    serial = undefined;
    console.error("ePaper display unavailable; will retry");
  }
}

console.log(`ePaper renderer watching ${devicePath}`);
await refresh();
setInterval(() => refresh().catch(() => {}), intervalMs);
