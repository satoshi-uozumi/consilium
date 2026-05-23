import http from "http";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { SpecialistIdentity } from "./types.js";
import { loadSkill } from "./skill-loader.js";

export class SpecialistServer {
  protected server: McpServer;

  constructor(protected readonly identity: SpecialistIdentity) {
    this.server = new McpServer({
      name: identity.name,
      version: identity.version,
    });
    this.registerTools();
  }

  private registerTools(): void {
    // TS2589: MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.server.registerTool as any)(
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
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    }
  }

  private startHTTP(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      this.server.connect(transport).then(() => {
        const httpServer = http.createServer(async (req, res) => {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

          if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
              const parsed = body ? JSON.parse(body) : undefined;
              await transport.handleRequest(req, res, parsed);
            });
          } else {
            await transport.handleRequest(req, res);
          }
        });

        httpServer.listen(port, () => {
          process.stderr.write(`[${this.identity.name}] MCP server listening on port ${port}\n`);
          resolve();
        });

        httpServer.on("error", reject);
      }).catch(reject);
    });
  }
}
