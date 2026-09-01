import { createHash } from "node:crypto";
import { exactlyThreeThreadCards } from "./thread-view.mjs";

export const EPAPER_WIDTH = 122;
export const EPAPER_HEIGHT = 250;
export const EPAPER_BYTES_PER_ROW = Math.ceil(EPAPER_WIDTH / 8);
export const EPAPER_PLANE_BYTES = EPAPER_BYTES_PER_ROW * EPAPER_HEIGHT;
export const EPAPER_FRAME_BYTES = EPAPER_PLANE_BYTES * 2;

const GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
};

class Bitmap {
  constructor() {
    // The confirmed Waveshare 2.13 B V4 protocol is active-low: 0 means an
    // ink pixel and 1 means an untouched/white pixel.
    this.data = Buffer.alloc(EPAPER_PLANE_BYTES, 0xff);
  }

  set(x, y, enabled = true) {
    if (x < 0 || x >= EPAPER_WIDTH || y < 0 || y >= EPAPER_HEIGHT || !enabled) return;
    const offset = y * EPAPER_BYTES_PER_ROW + Math.floor(x / 8);
    this.data[offset] &= ~(0x80 >> (x % 8));
  }

  line(x, y, width, height = 1) {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) this.set(column, row);
    }
  }

  box(x, y, width, height) {
    for (let column = x; column < x + width; column += 1) {
      this.set(column, y);
      this.set(column, y + height - 1);
    }
    for (let row = y; row < y + height; row += 1) {
      this.set(x, row);
      this.set(x + width - 1, row);
    }
  }

  text(value, x, y, scale = 1, maxChars = Infinity) {
    const chars = String(value ?? "").toUpperCase().slice(0, maxChars);
    [...chars].forEach((character, index) => {
      const glyph = GLYPHS[character] || GLYPHS["?"];
      const startX = x + index * (6 * scale);
      glyph.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
        if (pixel === "1") {
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) this.set(startX + columnIndex * scale + dx, y + rowIndex * scale + dy);
          }
        }
      }));
    });
  }
}

function rotate180(data) {
  const rotated = Buffer.alloc(EPAPER_PLANE_BYTES, 0xff);
  for (let y = 0; y < EPAPER_HEIGHT; y += 1) {
    for (let x = 0; x < EPAPER_WIDTH; x += 1) {
      const sourceOffset = y * EPAPER_BYTES_PER_ROW + Math.floor(x / 8);
      if ((data[sourceOffset] & (0x80 >> (x % 8))) !== 0) continue;
      const targetX = EPAPER_WIDTH - 1 - x;
      const targetY = EPAPER_HEIGHT - 1 - y;
      const targetOffset = targetY * EPAPER_BYTES_PER_ROW + Math.floor(targetX / 8);
      rotated[targetOffset] &= ~(0x80 >> (targetX % 8));
    }
  }
  return rotated;
}

function short(value, length) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function statusLabel(card) {
  return { active: "ACTIVE", waiting: "WAITING", error: "ERROR", idle: "IDLE", empty: "EMPTY" }[card.status] || "UNKNOWN";
}

export function renderEpaperFrame(payload, now = Date.now()) {
  const bitmap = new Bitmap();
  const color = new Bitmap();
  const cards = exactlyThreeThreadCards(payload?.threads);
  const state = payload?.offline ? "OFFLINE" : payload?.stale ? "STALE" : "ONLINE";

  bitmap.text("CODEX", 7, 6, 2, 5);
  bitmap.text("LOCAL", 88, 9, 1, 5);
  bitmap.text(state, 7, 23, 1, 8);
  bitmap.line(7, 32, 108);
  color.line(7, 32, 108);

  cards.forEach((card, index) => {
    const y = 38 + index * 64;
    bitmap.box(6, y, 110, 58);
    bitmap.text(String(index + 1).padStart(2, "0"), 11, y + 7, 1, 2);
    bitmap.text(short(card.title, 15), 27, y + 7, 1, 15);
    bitmap.text(short(card.summary, 17), 11, y + 21, 1, 17);
    bitmap.text(statusLabel(card), 11, y + 36, 1, 8);
    const age = card.updatedAt ? Math.max(0, Math.floor((now - Number(card.updatedAt) * 1000) / 60_000)) : null;
    bitmap.text(age === null ? "NO TIME" : `${Math.min(age, 999)}M AGO`, 66, y + 36, 1, 8);
    if (["active", "waiting", "error"].includes(card.status)) color.line(6, y, 2, 58);
  });

  bitmap.line(7, 230, 108);
  bitmap.text("LOCAL / READ ONLY", 9, 237, 1, 18);
  // The confirmed 2.13 B V4 panel uses two active-low 1-bit planes: black
  // followed by yellow. The controller expects 128 pixels per row, so each
  // 122-pixel row is already padded by the 16-byte bitmap stride.
  return Buffer.concat([rotate180(bitmap.data), rotate180(color.data)]);
}

export function frameDigest(frame) {
  return createHash("sha256").update(frame).digest("hex");
}
