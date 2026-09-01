const list = document.querySelector("#thread-list");
const pet = document.querySelector("#pet");
const petMessage = document.querySelector("#pet-message");
const connectionLabel = document.querySelector("#connection-label");
const connection = document.querySelector(".connection");
const lastRefresh = document.querySelector("#last-refresh");
const pollInterval = 15_000;
const emptyThreads = Array.from({ length: 3 }, (_, index) => ({
  id: `empty-${index + 1}`,
  title: "No recent thread",
  summary: "No recent Codex activity yet.",
  updatedAt: 0,
  status: "empty"
}));

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function relativeTime(unixSeconds) {
  if (!unixSeconds) return "recent";
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function primaryState(threads) {
  if (threads.some((thread) => thread.status === "waiting")) return "waiting";
  if (threads.some((thread) => thread.status === "active")) return "active";
  return "idle";
}

function render(payload) {
  const threads = Array.isArray(payload.threads) ? payload.threads.slice(0, 3) : [];
  while (threads.length < 3) threads.push(emptyThreads[threads.length]);
  const state = primaryState(threads);
  pet.dataset.state = state;
  connection.className = `connection ${payload.stale ? "offline" : "online"}`;
  connectionLabel.textContent = payload.stale ? "Showing cached activity" : "Connected to your Mac";
  lastRefresh.textContent = payload.stale ? "STALE" : "LIVE";

  petMessage.textContent = {
    active: "Something is cooking.",
    waiting: "Codex needs you.",
    idle: threads.length ? "All caught up." : "Quiet for now."
  }[state];

  list.innerHTML = threads.map((thread) => `
    <article class="thread-card" data-status="${escapeHtml(thread.status)}">
      <div class="card-top">
        <h3>${escapeHtml(thread.title)}</h3>
        <span class="status ${escapeHtml(thread.status)}">${escapeHtml(thread.status)} · ${relativeTime(thread.updatedAt)}</span>
      </div>
      <p>${escapeHtml(thread.summary)}</p>
    </article>
  `).join("");
}

function renderOffline() {
  if (!list.querySelector(".thread-card:not(.skeleton)")) render({ threads: emptyThreads, stale: true });
  pet.dataset.state = "offline";
  petMessage.textContent = "Looking for your Mac…";
  connection.className = "connection offline";
  connectionLabel.textContent = "Bridge unavailable";
  lastRefresh.textContent = "OFFLINE";
}

async function refresh() {
  try {
    const response = await fetch("/api/threads", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch {
    renderOffline();
  }
}

refresh();
setInterval(refresh, pollInterval);
