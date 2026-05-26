import http from "http";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

const PORT = 4099; // avoid colliding with a running gateway
const BASE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SPECIALISTS_DIR = join(BASE, ".consilium-test", "specialists");

// ── helpers ────────────────────────────────────────────────────────────────

function post(path, body, sessionId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Content-Length": Buffer.byteLength(payload),
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const req = http.request(
      { hostname: "localhost", port: PORT, path, method: "POST", headers },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          // SSE: extract the "data: <json>" line; fall back to raw body
          const match = data.match(/^data:\s*(.+)$/m);
          const json = match ? match[1].trim() : data;
          try {
            resolve({ status: res.statusCode, sessionId: res.headers["mcp-session-id"], body: JSON.parse(json) });
          } catch {
            resolve({ status: res.statusCode, sessionId: res.headers["mcp-session-id"], body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function startGateway() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["packages/gateway/dist/index.js"], {
      cwd: BASE,
      env: { ...process.env, PORT: String(PORT), CONSILIUM_SPECIALISTS_DIR: SPECIALISTS_DIR },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.includes("listening on port")) resolve(proc);
    });
    proc.on("error", reject);
    setTimeout(() => reject(new Error(`Gateway did not start:\n${stderr}`)), 5000);
  });
}

let passed = 0;
let failed = 0;

function ok(label, value) {
  if (value) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── setup ──────────────────────────────────────────────────────────────────

mkdirSync(join(SPECIALISTS_DIR, "security"), { recursive: true });
writeFileSync(join(SPECIALISTS_DIR, "security", "SKILL.md"), "# Security\n\nCheck OWASP top 10.");

// Override specialistsDir via a config file the gateway will pick up
mkdirSync(join(BASE, ".consilium-test"), { recursive: true });
writeFileSync(
  join(BASE, ".consilium-test", "config.json"),
  JSON.stringify({ port: PORT, local: { specialistsDir: ".consilium-test/specialists" } }, null, 2)
);

// The gateway reads config from .consilium/config.json — symlink or copy
const consiliumDir = join(BASE, ".consilium");
const configDest = join(consiliumDir, "config.json");
const configSrc = join(BASE, ".consilium-test", "config.json");
mkdirSync(consiliumDir, { recursive: true });
writeFileSync(configDest, JSON.stringify({ port: PORT, local: { specialistsDir: ".consilium-test/specialists" } }, null, 2));

// ── run ────────────────────────────────────────────────────────────────────

let gateway;
try {
  process.stdout.write("Starting gateway…\n");
  gateway = await startGateway();
  process.stdout.write(`Gateway up on port ${PORT}\n\n`);

  // 1. Unknown specialist → 404
  console.log("1. Unknown path returns 404");
  const r404 = await post("/unknown", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  ok("status 404", r404.status === 404);

  // 2. Initialize session on /security
  console.log("\n2. Initialize MCP session at /security");
  const init = await post("/security", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  ok("status 200", init.status === 200);
  ok("session ID returned", !!init.sessionId);
  ok("result.serverInfo.name === 'security'", init.body?.result?.serverInfo?.name === "security");
  const sessionId = init.sessionId;

  // 3. List tools — expect get_skill
  console.log("\n3. List tools");
  const tools = await post("/security", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
  ok("status 200", tools.status === 200);
  const toolNames = tools.body?.result?.tools?.map((t) => t.name) ?? [];
  ok("get_skill tool present", toolNames.includes("get_skill"));

  // 4. Call get_skill — expect SKILL.md content
  console.log("\n4. Call get_skill");
  const skill = await post("/security", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_skill", arguments: {} } }, sessionId);
  ok("status 200", skill.status === 200);
  const text = skill.body?.result?.content?.[0]?.text ?? "";
  ok("SKILL.md content returned", text.includes("OWASP"));

} finally {
  gateway?.kill();

  // cleanup test config written to .consilium/config.json
  const hadExistingConsilium = existsSync(join(BASE, ".consilium", "specialists"));
  if (!hadExistingConsilium) {
    rmSync(join(BASE, ".consilium"), { recursive: true, force: true });
  } else {
    rmSync(configDest, { force: true });
  }
  rmSync(join(BASE, ".consilium-test"), { recursive: true, force: true });

  console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
