const FALLBACK_TITLE = "Untitled Codex thread";
const EMPTY_CARD = {
  id: "empty",
  title: "No recent thread",
  summary: "No recent Codex activity yet.",
  updatedAt: 0,
  status: "empty"
};

const ANSI_ESCAPE = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ABSOLUTE_PATH = /(?:\/(?:Users|home|private|opt|var|tmp)\/[^\s]+|[A-Z]:\\[^\s]+)/gi;
const SECRET_SHAPES = /(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:ghp_|github_pat_|sk-|xox[baprs]-)[A-Za-z0-9._-]+|(?:token|password|passwd|secret|api[_-]?key)\s*[=:]\s*[^\s]+)/gi;
const SAFE_STATUSES = new Set(["active", "waiting", "idle", "error", "unknown"]);

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

export function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(ANSI_ESCAPE, " ")
    .replace(CONTROL_CHARS, " ")
    .replace(ABSOLUTE_PATH, "[path]")
    .replace(SECRET_SHAPES, "[redacted]")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function statusType(status) {
  if (typeof status === "string") return SAFE_STATUSES.has(status) ? status : "unknown";
  if (!status || typeof status !== "object") return "unknown";

  if (status.type === "active" && Array.isArray(status.activeFlags)) {
    if (status.activeFlags.includes("waitingOnApproval") || status.activeFlags.includes("waitingOnUserInput")) {
      return "waiting";
    }
  }

  if (status.type === "systemError") return "error";
  return typeof status.type === "string" && SAFE_STATUSES.has(status.type) ? status.type : "unknown";
}

export function toThreadCard(thread) {
  const title = sanitizeText(firstText(thread.name, thread.title, thread.preview) || FALLBACK_TITLE, 96);
  const preview = sanitizeText(firstText(thread.preview, thread.summary, thread.name) || "No preview available yet.", 240);

  return {
    id: sanitizeText(String(thread.id || "unknown"), 128),
    title: title.slice(0, 96),
    summary: preview.slice(0, 240),
    updatedAt: Number.isFinite(Number(thread.updatedAt))
      ? Number(thread.updatedAt)
      : (Number.isFinite(Number(thread.createdAt)) ? Number(thread.createdAt) : 0),
    status: statusType(thread.status)
  };
}

export function newestThreadCards(threads, limit = 3) {
  return [...threads]
    .map(toThreadCard)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 10)));
}

export function exactlyThreeThreadCards(threads) {
  const cards = newestThreadCards(Array.isArray(threads) ? threads : [], 3);
  return [...cards, ...Array.from({ length: Math.max(0, 3 - cards.length) }, (_, index) => ({
    ...EMPTY_CARD,
    id: `${EMPTY_CARD.id}-${index + 1}`
  }))];
}
