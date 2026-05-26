import fs from "fs";
import http from "http";
import path from "path";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
function loadSkill(specialistName: string): string {
  const skillPath = path.resolve(process.cwd(), `.consilium/specialists/${specialistName}/SKILL.md`);
  if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, "utf-8");
  return `# ${specialistName}\n\nNo SKILL.md found.`;
}

export class GatewayServer {
  constructor(private readonly port: number) {}

  private discoverSpecialists(): string[] {
    const dir = path.resolve(process.cwd(), ".consilium/specialists");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "SKILL.md")))
      .map((e) => e.name);
  }

  private createMcpServer(specialists: string[]): McpServer {
    const server = new McpServer({ name: "consilium-gateway", version: "0.1.0" });
    for (const name of specialists) {
      // TS2589: MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server.registerTool as any)(
        `${name}__get_skill`,
        { description: `Return the SKILL.md for the ${name} specialist` },
        async () => ({ content: [{ type: "text" as const, text: loadSkill(name) }] })
      );
    }
    return server;
  }

  start(): Promise<void> {
    const specialists = this.discoverSpecialists();
    if (specialists.length === 0) {
      process.stderr.write("[consilium-gateway] warning: no specialists found in .consilium/specialists/ — add a SKILL.md to get started\n");
    } else {
      process.stderr.write(`[consilium-gateway] loaded specialists: ${specialists.join(", ")}\n`);
    }

    const sessions = new Map<string, StreamableHTTPServerTransport>();

    return new Promise((resolve, reject) => {
      const httpServer = http.createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (req.method === "POST" && !sessionId) {
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
          transport.onclose = () => sessions.delete(transport.sessionId!);
          await this.createMcpServer(specialists).connect(transport);
          sessions.set(transport.sessionId!, transport);
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
          });
        } else if (sessionId) {
          const transport = sessions.get(sessionId);
          if (!transport) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not found" }));
            return;
          }
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
              await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
            });
          } else {
            await transport.handleRequest(req, res);
            if (req.method === "DELETE") sessions.delete(sessionId);
          }
        } else {
          res.writeHead(400);
          res.end();
        }
      });

      httpServer.listen(this.port, () => {
        process.stderr.write(`[consilium-gateway] listening on port ${this.port}\n`);
        resolve();
      });

      httpServer.on("error", reject);
    });
  }
}