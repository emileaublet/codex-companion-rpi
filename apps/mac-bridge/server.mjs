import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CodexRpcClient } from "../../packages/codex-rpc-client.mjs";
import { exactlyThreeThreadCards } from "../../packages/thread-view.mjs";

const host = process.env.BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.BRIDGE_PORT || 4174);
const tokenFile = process.env.BRIDGE_TOKEN_FILE || "";
const codex = new CodexRpcClient(process.env.CODEX_BIN || "codex");

async function loadToken() {
  if (tokenFile) return (await readFile(tokenFile, "utf8")).trim();
  return (process.env.BRIDGE_TOKEN || "").trim();
}

function sameToken(expected, received) {
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

const token = await loadToken().catch(() => "");
if (token.length < 32) {
  console.error("A bridge token file containing at least 32 characters is required.");
  process.exit(1);
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const header = request.headers.authorization || "";
  const prefix = "Bearer ";
  return header.startsWith(prefix) && sameToken(token, header.slice(prefix.length));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json(response, 200, { ok: true });
  }

  if (request.method !== "GET" || url.pathname !== "/api/threads") {
    return json(response, 404, { error: "Not found" });
  }

  if (!authorized(request)) return json(response, 401, { error: "Unauthorized" });

  try {
    const threads = await codex.recentThreads(3);
    return json(response, 200, {
      threads: exactlyThreeThreadCards(threads),
      source: "codex-app-server",
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[bridge] Codex request failed: ${error instanceof Error ? error.name : "unknown error"}`);
    return json(response, 503, {
      error: "Codex history is temporarily unavailable"
    });
  }
});

server.listen(port, host, () => {
  console.log(`Codex companion bridge listening on http://${host}:${port}`);
});

function shutdown() {
  server.close();
  codex.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
