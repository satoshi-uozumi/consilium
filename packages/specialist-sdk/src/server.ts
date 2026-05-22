import http from "http";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
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
    this.server.tool(
      "consult",
      `Consult the ${this.identity.name} specialist for domain-specific recommendations`,
      {
        topic: z.string().describe("The topic or question to consult on"),
        context: z.string().optional().describe("Relevant context from the codebase or task"),
      },
      async ({ topic, context }) => this.consult(topic, context)
    );

    this.server.tool(
      "review",
      `Ask the ${this.identity.name} specialist to review generated code against a plan`,
      {
        plan: z.string().describe("The plan.md content the code should conform to"),
        code: z.string().describe("The generated code to review"),
      },
      async ({ plan, code }) => this.review(plan, code)
    );

    this.server.tool(
      "get_skill",
      `Return the SKILL.md for the ${this.identity.name} specialist`,
      {},
      async () => ({ content: [{ type: "text" as const, text: loadSkill(this.identity.name) }] })
    );
  }

  protected async consult(topic: string, context?: string): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    void context;
    const skill = loadSkill(this.identity.name);
    return { content: [{ type: "text", text: `[${this.identity.name}] consult not implemented.\n\nSKILL:\n${skill}` }] };
  }

  protected async review(plan: string, code: string): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    void plan; void code;
    return { content: [{ type: "text", text: `[${this.identity.name}] review not implemented.` }] };
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
