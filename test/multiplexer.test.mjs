import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createTestEnv, startGateway } from "./helpers/gateway.mjs";
import { post, initialize } from "./helpers/mcp.mjs";

const PORT = 4099;
let gateway;
let env;

before(async () => {
  env = createTestEnv();
  env.addSpecialist("security", "# Security\n\nCheck OWASP top 10.");
  gateway = await startGateway(env.dir, PORT);
});

after(async () => {
  await new Promise((resolve) => {
    if (!gateway) return resolve();
    gateway.on("exit", resolve);
    gateway.kill();
  });
  env?.cleanup();
});

describe("routing", () => {
  it("returns 404 for unknown specialist", async () => {
    const r = await post(PORT, "/unknown", {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    assert.equal(r.status, 404);
  });
});

describe("security specialist — MCP session flow", () => {
  let sessionId;

  it("initialize returns 200 with session ID and server name", async () => {
    const r = await initialize(PORT, "/security");
    assert.equal(r.status, 200);
    assert.ok(r.sessionId, "session ID should be present");
    assert.equal(r.body?.result?.serverInfo?.name, "security");
    sessionId = r.sessionId;
  });

  it("tools/list includes get_skill", async () => {
    const r = await post(PORT, "/security", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sessionId);
    assert.equal(r.status, 200);
    const names = r.body?.result?.tools?.map((t) => t.name) ?? [];
    assert.ok(names.includes("get_skill"), `expected get_skill, got: ${names.join(", ")}`);
  });

  it("get_skill returns SKILL.md content", async () => {
    const r = await post(PORT, "/security",
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_skill", arguments: {} } },
      sessionId
    );
    assert.equal(r.status, 200);
    const text = r.body?.result?.content?.[0]?.text ?? "";
    assert.ok(text.includes("OWASP"), `expected OWASP in skill content, got: ${text.slice(0, 100)}`);
  });
});