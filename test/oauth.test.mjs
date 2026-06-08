import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createTestEnv, startGateway } from "./helpers/gateway.mjs";
import { post } from "./helpers/mcp.mjs";
import { createOAuthSetup } from "./helpers/oauth.mjs";

const PORT = 4098;
let gateway, env, oauth;

before(async () => {
  oauth = await createOAuthSetup();
  env = createTestEnv();
  env.addSpecialist("typescript", "# TypeScript\n\nTS best practices.");
  env.setConfig({ specialists: [{ name: "typescript", url: `http://localhost:${PORT}/typescript` }] });
  env.setGatewayConfig({ port: PORT, auth: { issuer: oauth.issuer, audience: oauth.audience } });
  gateway = await startGateway(env.dir, PORT);
});

after(async () => {
  await new Promise((resolve) => { if (!gateway) return resolve(); gateway.on("exit", resolve); gateway.kill(); });
  env?.cleanup();
  await oauth?.stop();
});

// ── helpers ────────────────────────────────────────────────────────────────

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    }).on("error", reject);
  });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("OAuth protected resource metadata", () => {
  it("GET /.well-known/oauth-protected-resource returns metadata without token", async () => {
    const r = await get("/.well-known/oauth-protected-resource");
    assert.equal(r.status, 200);
    assert.equal(r.body.resource, `http://localhost:${PORT}`);
    assert.deepEqual(r.body.authorization_servers, [oauth.issuer]);
  });
});

describe("unauthenticated requests", () => {
  it("no token → 401 with WWW-Authenticate header", async () => {
    const r = await post(PORT, "/typescript", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    assert.equal(r.status, 401);
    assert.ok(r.body.error === "Unauthorized");
  });

  it("invalid token → 401", async () => {
    const r = await post(PORT, "/typescript", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }, undefined, "Bearer not-a-valid-token");
    assert.equal(r.status, 401);
  });

  it("expired token → 401", async () => {
    const token = await oauth.signToken({ expiresIn: "-1s" });
    const r = await post(PORT, "/typescript", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }, undefined, `Bearer ${token}`);
    assert.equal(r.status, 401);
  });
});

describe("authenticated requests", () => {
  it("valid token → MCP session initialized", async () => {
    const token = await oauth.signToken();
    const r = await post(PORT, "/typescript", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }, undefined, `Bearer ${token}`);
    assert.equal(r.status, 200);
    assert.ok(r.sessionId);
    assert.equal(r.body?.result?.serverInfo?.name, "typescript");
  });
});