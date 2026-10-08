#!/usr/bin/env node
/* global process, AbortSignal, URL, fetch, setTimeout, clearTimeout */
/**
 * clear-connect smoke test: proves an agent's clear-mcp setup works end to end, with no
 * dependencies beyond Node 20+. It checks the environment, pings clear-api, then launches the
 * server exactly as an MCP client would (stdio, newline-delimited JSON-RPC), lists its tools
 * and calls clear_whoami plus one content read.
 *
 *   CLEAR_API_URL=https://<clear-api> CLEAR_API_KEY=sk_live_… node smoke.mjs [options] [-- <server command…>]
 *
 * Options:
 *   --worker        expect a Worker process (CLEAR_MCP_WORKER=1 and a worker-role key)
 *   --find <name>   also resolve a place name with clear_find_location
 *   --json          print the report as one JSON object instead of text
 *
 * The server command defaults to `npx -y @clear-initiative/mcp`; pass your own after `--`
 * (e.g. `-- node /path/to/clear-mcp/dist/bin.js`) to test a pinned version or a checkout.
 * The key is never printed. Exit 0 when every check passes, 1 otherwise.
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const opts = sep === -1 ? argv : argv.slice(0, sep);
const serverCmd = sep === -1 ? ["npx", "-y", "@clear-initiative/mcp"] : argv.slice(sep + 1);
const expectWorker = opts.includes("--worker");
const asJson = opts.includes("--json");
const findIdx = opts.indexOf("--find");
const findQuery = findIdx === -1 ? null : opts[findIdx + 1];

const HINTS = {
  UNAUTHENTICATED: "The key is unknown or revoked. Mint a new one at <CLEAR_API_URL>/portal.",
  FORBIDDEN:
    "The account cannot read this. PENDING_APPROVAL means an admin must approve the user in clear-api first.",
  UPSTREAM_UNAVAILABLE: "clear-api did not answer. Check CLEAR_API_URL (base URL, no /graphql) and that the API is up.",
  UPSTREAM_ERROR: "clear-api answered with an error. Check the URL points at a clear-api and its version matches.",
};

const checks = [];
let failed = false;
function check(name, ok, detail, hint) {
  checks.push({ name, ok, detail, ...(ok || !hint ? {} : { hint }) });
  if (!ok) failed = true;
  return ok;
}

function finish(extra = {}) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ ok: !failed, checks, ...extra }, null, 2) + "\n");
  } else {
    for (const c of checks) {
      process.stdout.write(`${c.ok ? "ok  " : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}\n`);
      if (c.hint) process.stdout.write(`      fix: ${c.hint}\n`);
    }
    process.stdout.write(failed ? "\nclear-connect: setup is NOT working.\n" : "\nclear-connect: setup works.\n");
  }
  process.exit(failed ? 1 : 0);
}

/** Node's fetch says only "fetch failed"; the reason (ECONNREFUSED, ENOTFOUND, …) is in `cause`. */
function describe(err) {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause;
  return cause ? `${err.message}: ${cause.code ?? cause.message ?? String(cause)}` : err.message;
}

// 1. Environment ------------------------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
check("node", major >= 20, `v${process.versions.node}`, "clear-mcp needs Node 20 or newer on PATH.");

const rawUrl = (process.env.CLEAR_API_URL ?? "").trim();
const key = (process.env.CLEAR_API_KEY ?? "").trim();
const apiUrl = rawUrl.replace(/\/+$/, "").replace(/\/graphql$/, "");
let urlOk;
try {
  urlOk = /^https?:$/.test(new URL(apiUrl).protocol);
} catch {
  urlOk = false;
}
check("CLEAR_API_URL", urlOk, urlOk ? apiUrl : rawUrl ? `not a URL: ${rawUrl}` : "unset", "Set it to clear-api's base URL, e.g. https://api.clear.example.org.");
check(
  "CLEAR_API_KEY",
  key.startsWith("sk_live_"),
  key ? (key.startsWith("sk_live_") ? "set (sk_live_…)" : "set, but not an sk_live_ key") : "unset",
  "Use a CLEAR API key minted at <CLEAR_API_URL>/portal; it starts with sk_live_.",
);
if (expectWorker) {
  check("CLEAR_MCP_WORKER", process.env.CLEAR_MCP_WORKER === "1", process.env.CLEAR_MCP_WORKER ?? "unset", "A Worker process sets CLEAR_MCP_WORKER=1 (the literal 1).");
}
if (failed) finish();

// 2. clear-api reachable -----------------------------------------------------------------
try {
  const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
  check("clear-api /health", res.ok, `HTTP ${res.status}`, HINTS.UPSTREAM_UNAVAILABLE);
} catch (err) {
  check("clear-api /health", false, describe(err), HINTS.UPSTREAM_UNAVAILABLE);
  finish();
}

// 3. The server over stdio ----------------------------------------------------------------
const child = spawn(serverCmd[0], serverCmd.slice(1), {
  env: { ...process.env, CLEAR_MCP_LOG_LEVEL: process.env.CLEAR_MCP_LOG_LEVEL ?? "warn" },
  stdio: ["pipe", "pipe", "pipe"],
});
let stderrTail = "";
child.stderr.on("data", (d) => {
  stderrTail = (stderrTail + d.toString()).slice(-2000);
});

const pending = new Map();
let buffer = "";
let nextId = 1;
child.stdout.on("data", (d) => {
  buffer += d.toString();
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const waiter = pending.get(msg.id);
    if (waiter) {
      pending.delete(msg.id);
      waiter(msg);
    }
  }
});
child.on("error", (err) => {
  check("server starts", false, `${serverCmd.join(" ")}: ${err.message}`, "Is the server command on PATH? npx ships with Node.");
  finish();
});
child.on("exit", (code) => {
  if (pending.size === 0) return;
  check("server starts", false, `exited with code ${code}: ${stderrTail.trim().split("\n").slice(-3).join(" | ")}`, "Read the stderr line above; a missing variable is named there.");
  finish();
});

function rpc(method, params, timeoutMs = 120_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

/** A tool call's parsed JSON result, or `{ error }` with the server's error value. */
async function callTool(name, args = {}) {
  const msg = await rpc("tools/call", { name, arguments: args }, 60_000);
  if (msg.error) return { error: { code: "PROTOCOL", message: msg.error.message } };
  const result = msg.result;
  const body = result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "{}");
  return result.isError ? { error: body } : { value: body };
}

const report = {};
try {
  // The first launch may download the package, so initialize gets the long timeout.
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "clear-connect-smoke", version: "1" },
  });
  const info = init.result?.serverInfo;
  check("server starts", Boolean(info), info ? `${info.name} ${info.version}` : JSON.stringify(init.error));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const list = await rpc("tools/list", {}, 30_000);
  const tools = (list.result?.tools ?? []).map((t) => t.name);
  check("tools/list", tools.includes("clear_whoami"), `${tools.length} tools`);
  report.tools = tools;

  const who = await callTool("clear_whoami");
  if (who.error) {
    check("clear_whoami", false, `${who.error.code}${who.error.subCode ? `/${who.error.subCode}` : ""}: ${who.error.message}`, HINTS[who.error.code]);
  } else {
    const w = who.value;
    report.whoami = { role: w.caller.role, isActive: w.caller.isActive, teams: w.teams.map((t) => t.name), locale: w.locale, apiUrl: w.apiUrl, workerEnabled: w.workerEnabled, escapeHatchEnabled: w.escapeHatchEnabled };
    check("clear_whoami", w.caller.isActive !== false, `role ${w.caller.role ?? "none"}, ${w.teams.length} team(s), locale ${w.locale}, ${w.apiUrl}`, "The user is inactive in clear-api; ask an admin to reactivate it.");
    if (expectWorker) {
      check("worker mode", w.workerEnabled && w.caller.role === "worker", `workerEnabled ${w.workerEnabled}, role ${w.caller.role}`, "A Worker needs CLEAR_MCP_WORKER=1 and a key from clear-api's scripts/create-worker-user.ts.");
    } else if (w.workerEnabled) {
      check("worker mode", false, "Worker tools are on in a reader's process", "Unset CLEAR_MCP_WORKER unless this process is a Task Worker.");
    }
  }

  const alerts = await callTool("clear_list_alerts", { limit: 1 });
  if (alerts.error) {
    check("content read (clear_list_alerts)", false, `${alerts.error.code}${alerts.error.subCode ? `/${alerts.error.subCode}` : ""}: ${alerts.error.message}`, HINTS[alerts.error.code]);
  } else {
    check("content read (clear_list_alerts)", true, `${alerts.value.totalCount} alert(s) visible`);
  }

  if (findQuery) {
    const found = await callTool("clear_find_location", { query: findQuery });
    const top = found.value?.items?.[0];
    check(
      `clear_find_location "${findQuery}"`,
      Boolean(top),
      found.error ? `${found.error.code}: ${found.error.message}` : top ? `${top.name} (level ${top.level}) → ${top.id}` : "no match",
      found.error ? HINTS[found.error.code] : "Try a country or state name; level 3+ places are not searchable.",
    );
  }
} catch (err) {
  check("server responds", false, err instanceof Error ? err.message : String(err), stderrTail ? `server stderr: ${stderrTail.trim().split("\n").slice(-2).join(" | ")}` : undefined);
}

pending.clear();
child.kill();
finish(report);
