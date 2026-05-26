import http from "http";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SpecialistIdentity } from "./types.js";
import { loadSkill } from "./skill-loader.js";

export class SpecialistServer {
  private readonly stdio: McpServer;

  constructor(protected readonly identity: SpecialistIdentity) {
    this.stdio = this.createMcpServer();
  }

  private createMcpServer(): McpServer {
    const server = new McpServer({ name: this.identity.name, version: this.identity.version });
    this.registerToolsOn(server);
    return server;
  }

  // TS2589: MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected registerToolsOn(server: McpServer): void {
    (server.registerTool as any)(
      "get_skill",
      { description: `Return the SKILL.md for the ${this.identity.name} specialist` },
      async () => ({ content: [{ type: "text" as const, text: loadSkill(this.identity.name) }] })
    );
  }

  async start(): Promise<void> {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
    if (port) {
      await this.startHTTP(port);
    } else {
      await this.stdio.connect(new StdioServerTransport());
    }
  }

  private startHTTP(port: number): Promise<void> {
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
          // New session: initialize request
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
          transport.onclose = () => sessions.delete(transport.sessionId!);
          await this.createMcpServer().connect(transport);
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
            // GET (SSE) or DELETE
            await transport.handleRequest(req, res);
            if (req.method === "DELETE") sessions.delete(sessionId);
          }
        } else {
          res.writeHead(400);
          res.end();
        }
      });

      httpServer.listen(port, () => {
        process.stderr.write(`[${this.identity.name}] MCP server listening on port ${port}\n`);
        resolve();
      });

      httpServer.on("error", reject);
    });
  }
}
