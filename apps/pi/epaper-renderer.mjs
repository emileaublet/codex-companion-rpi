import { open } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { EPAPER_FRAME_BYTES, frameDigest, renderEpaperFrame } from "../../packages/epaper-frame.mjs";

const companionUrl = (process.env.COMPANION_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const devicePath = process.env.EPAPER_SERIAL_DEVICE || "/dev/ttyACM0";
const intervalMs = Math.max(30_000, Number(process.env.EPAPER_UPDATE_INTERVAL_MS || 60_000));
const protocolVersion = "CCEP/5";
let serial;
let lastDigest = "";

function configureSerial() {
  const result = spawnSync("stty", ["-F", devicePath, "115200", "raw", "-echo", "-ixon", "-ixoff", "min", "0", "time", "1"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("serial configuration failed");
}

async function openSerial() {
  if (serial) return serial;
  configureSerial();
  serial = await open(devicePath, "r+");
  // Opening a USB serial handle can toggle DTR and reset the ESP32.
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  // Discard READY/ERR lines left by an earlier renderer instance. Only
  // responses observed after this point belong to the frame being sent.
  const staleBuffer = Buffer.alloc(256);
  const drainDeadline = Date.now() + 500;
  while (Date.now() < drainDeadline) {
    const result = await serial.read(staleBuffer, 0, staleBuffer.length, null);
    if (result.bytesRead === 0) break;
  }
  return serial;
}

async function sendFrame(frame) {
  if (frame.length !== EPAPER_FRAME_BYTES) throw new Error("invalid ePaper frame size");
  const handle = await openSerial();
  const header = Buffer.from(`${protocolVersion} ${frame.length}\n`, "ascii");
  await handle.write(header);
  await handle.write(frame);

  const responseBuffer = Buffer.alloc(128);
  let response = "";
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await handle.read(responseBuffer, 0, responseBuffer.length, null);
    if (result.bytesRead > 0) {
      response += responseBuffer.subarray(0, result.bytesRead).toString("ascii");
      if (response.includes("CCEP OK")) return;
      if (response.includes("CCEP ERR")) throw new Error("ePaper rejected frame");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("ePaper acknowledgement timeout");
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
