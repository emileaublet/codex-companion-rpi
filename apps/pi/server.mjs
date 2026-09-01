import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exactlyThreeThreadCards } from "../../packages/thread-view.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const publicRoot = path.join(here, "public");
const port = Number(process.env.PORT || 4173);
const bridgeUrl = (process.env.BRIDGE_URL || "http://127.0.0.1:4174").replace(/\/$/, "");
const bridgeTokenFile = process.env.BRIDGE_TOKEN_FILE || "";
const mockMode = process.env.MOCK_MODE === "1";
let lastGoodPayload;

function validBridgeUrl(value) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("BRIDGE_URL must be an HTTP(S) URL without embedded credentials");
  }
  return parsed.toString().replace(/\/$/, "");
}

const safeBridgeUrl = validBridgeUrl(bridgeUrl);

async function loadBridgeToken() {
  if (bridgeTokenFile) return (await readFile(bridgeTokenFile, "utf8")).trim();
  return (process.env.BRIDGE_TOKEN || "").trim();
}

const bridgeToken = mockMode ? "mock-token" : await loadBridgeToken().catch(() => "");
if (!mockMode && bridgeToken.length < 32) {
  console.error("A bridge token file containing at least 32 characters is required.");
  process.exit(1);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  response.end(JSON.stringify(body));
}

async function readMock() {
  return normalizePayload(JSON.parse(await readFile(path.join(root, "fixtures/threads.json"), "utf8")));
}

function normalizePayload(payload) {
  if (!payload || !Array.isArray(payload.threads)) throw new Error("Invalid bridge payload");
  return {
    threads: exactlyThreeThreadCards(payload.threads),
    source: mockMode ? "mock" : "mac-bridge",
    refreshedAt: typeof payload.refreshedAt === "string" ? payload.refreshedAt : new Date().toISOString()
  };
}

async function fetchThreads() {
  if (mockMode) return readMock();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${safeBridgeUrl}/api/threads`, {
      headers: { authorization: `Bearer ${bridgeToken}` },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Bridge returned ${response.status}`);
    const payload = normalizePayload(await response.json());
    lastGoodPayload = payload;
    return payload;
  } catch (error) {
    if (lastGoodPayload) {
      return { ...lastGoodPayload, stale: true };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(urlPath, response) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.resolve(publicRoot, `.${decodeURIComponent(requested)}`);
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const contents = await readFile(resolved);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(resolved)] || "application/octet-stream",
      "cache-control": resolved.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer"
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/healthz") {
    return sendJson(response, 200, { ok: true, mockMode });
  }

  if (request.method === "GET" && url.pathname === "/api/threads") {
    try {
      return sendJson(response, 200, await fetchThreads());
    } catch (error) {
      return sendJson(response, 503, {
        threads: [],
        error: "Waiting for the Mac bridge"
      });
    }
  }

  if (request.method === "GET") return serveStatic(url.pathname, response);
  response.writeHead(405).end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Companion display available at http://127.0.0.1:${port}`);
});
