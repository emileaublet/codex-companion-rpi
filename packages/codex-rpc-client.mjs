import { spawn } from "node:child_process";
import readline from "node:readline";

export class CodexRpcClient {
  #command;
  #proc;
  #pending = new Map();
  #nextId = 1;
  #started;

  constructor(command = "codex") {
    this.#command = command;
  }

  async start() {
    if (this.#started) return this.#started;
    this.#started = this.#startOnce();
    return this.#started;
  }

  async #startOnce() {
    const childEnv = { ...process.env };
    delete childEnv.BRIDGE_TOKEN;
    delete childEnv.BRIDGE_TOKEN_FILE;
    this.#proc = spawn(this.#command, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv
    });

    const lines = readline.createInterface({ input: this.#proc.stdout });
    lines.on("line", (line) => this.#receive(line));

    // App-server diagnostics may contain paths or user-provided text. Keep them
    // out of the bridge logs; the bridge only reports safe error categories.
    this.#proc.stderr.resume();

    this.#proc.once("error", (error) => this.#failAll(error));
    this.#proc.once("exit", (code, signal) => {
      this.#failAll(new Error(`codex app-server exited (${code ?? signal})`));
      this.#started = undefined;
      this.#proc = undefined;
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "codex_companion",
          title: "Codex Companion",
          version: "0.1.0"
        }
      });
      this.notify("initialized", {});
    } catch (error) {
      this.#proc?.kill("SIGTERM");
      this.#started = undefined;
      throw error;
    }
  }

  #receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.id === undefined) return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;

    this.#pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) {
      pending.reject(new Error(message.error.message || "Codex app-server error"));
    } else {
      pending.resolve(message.result);
    }
  }

  #send(message) {
    if (!this.#proc?.stdin?.writable) throw new Error("Codex app-server is unavailable");
    this.#proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  request(method, params = {}, timeoutMs = 10_000) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);

      this.#pending.set(id, { resolve, reject, timeout });
      try {
        this.#send({ method, id, params });
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params = {}) {
    this.#send({ method, params });
  }

  async recentThreads(limit = 3) {
    await this.start();
    const result = await this.request("thread/list", {
      limit,
      sortKey: "recency_at",
      sortDirection: "desc",
      archived: false,
      sourceKinds: ["cli", "vscode", "exec", "appServer", "unknown"]
    });
    return Array.isArray(result?.data) ? result.data : [];
  }

  close() {
    this.#proc?.kill("SIGTERM");
  }
}
