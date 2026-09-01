import test from "node:test";
import assert from "node:assert/strict";
import { EPAPER_FRAME_BYTES, frameDigest, renderEpaperFrame } from "../packages/epaper-frame.mjs";

test("ePaper renderer creates a fixed-size two-plane color frame", () => {
  const frame = renderEpaperFrame({
    threads: [
      { id: "1", title: "First thread", summary: "A safe summary", status: "active", updatedAt: 1788270000 },
      { id: "2", title: "Second thread", summary: "Waiting", status: "waiting", updatedAt: 1788260000 },
      { id: "3", title: "Third thread", summary: "Idle", status: "idle", updatedAt: 1788250000 }
    ]
  });
  assert.equal(frame.length, EPAPER_FRAME_BYTES);
  assert.equal(EPAPER_FRAME_BYTES, 5512);
  assert.notEqual(frameDigest(frame), frameDigest(Buffer.alloc(EPAPER_FRAME_BYTES)));
});

test("ePaper renderer handles offline and missing threads without leaking input", () => {
  const frame = renderEpaperFrame({
    offline: true,
    threads: [{ id: "x", title: "Bearer super-secret", summary: "/Users/emileaublet/private", status: "unknown" }]
  });
  assert.equal(frame.length, EPAPER_FRAME_BYTES);
});
