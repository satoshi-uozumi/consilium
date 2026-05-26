import fs from "fs";
import http from "http";
import path from "path";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
const DEFAULT_SPECIALISTS_DIR = ".consilium/specialists";

interface GatewayConfig {
  port?: number;
  specialistsDir?: string;
  specialists?: string[];
}

function loadSkill(specialistName: string, specialistsDir: string): string {
  const skillPath = path.resolve(process.cwd(), specialistsDir, specialistName, "SKILL.md");
  if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, "utf-8");
  return `# ${specialistName}\n\nNo SKILL.md found.`;
}

export class GatewayServer {
  constructor(private readonly defaultPort: number) {}

  private loadConfig(): GatewayConfig {
    const configPath = path.resolve(process.cwd(), ".consilium/config.json");
    if (!fs.existsSync(configPath)) return {};

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      process.stderr.write("[consilium-gateway] warning: failed to parse .consilium/config.json — using defaults\n");
      return {};
    }

    const known = new Set(["port", "specialistsDir", "specialists"]);
    for (const key of Object.keys(raw)) {
      if (!known.has(key)) {
        process.stderr.write(`[consilium-gateway] warning: unknown config key "${key}" — ignored\n`);
      }
    }

    const config: GatewayConfig = {};

    if ("port" in raw) {
      if (typeof raw.port !== "number") {
        process.stderr.write(`[consilium-gateway] warning: config "port" must be a number — ignored\n`);
      } else {
        config.port = raw.port;
      }
    }

    if ("specialistsDir" in raw) {
      if (typeof raw.specialistsDir !== "string") {
        process.stderr.write(`[consilium-gateway] warning: config "specialistsDir" must be a string — ignored\n`);
      } else {
        config.specialistsDir = raw.specialistsDir;
      }
    }

    if ("specialists" in raw) {
      if (!Array.isArray(raw.specialists) || !raw.specialists.every((s) => typeof s === "string")) {
        process.stderr.write(`[consilium-gateway] warning: config "specialists" must be an array of strings — ignored\n`);
      } else {
        config.specialists = raw.specialists as string[];
      }
    }

    return config;
  }

  private discoverSpecialists(specialistsDir: string): string[] {
    const dir = path.resolve(process.cwd(), specialistsDir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "SKILL.md")))
      .map((e) => e.name);
  }

  private resolveSpecialists(names: string[], specialistsDir: string): string[] {
    return names.filter((name) => {
      const exists = fs.existsSync(path.resolve(process.cwd(), specialistsDir, name, "SKILL.md"));
      if (!exists) process.stderr.write(`[consilium-gateway] warning: specialist "${name}" has no SKILL.md in ${specialistsDir} — skipping\n`);
      return exists;
    });
  }

  private createMcpServer(specialists: string[], specialistsDir: string): McpServer {
    const server = new McpServer({ name: "consilium-gateway", version: "0.1.0" });
    for (const name of specialists) {
      // TS2589: MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server.registerTool as any)(
        `${name}__get_skill`,
        { description: `Return the SKILL.md for the ${name} specialist` },
        async () => ({ content: [{ type: "text" as const, text: loadSkill(name, specialistsDir) }] })
      );
    }
    return server;
  }

  start(): Promise<void> {
    const config = this.loadConfig();
    const port = config.port ?? this.defaultPort;
    const specialistsDir = config.specialistsDir ?? DEFAULT_SPECIALISTS_DIR;
    const specialists = config.specialists
      ? this.resolveSpecialists(config.specialists, specialistsDir)
      : this.discoverSpecialists(specialistsDir);

    if (specialists.length === 0) {
      process.stderr.write(`[consilium-gateway] warning: no specialists found in ${specialistsDir} — add a SKILL.md to get started\n`);
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
          await this.createMcpServer(specialists, specialistsDir).connect(transport);
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

      httpServer.listen(port, () => {
        process.stderr.write(`[consilium-gateway] listening on port ${port}\n`);
        resolve();
      });

      httpServer.on("error", reject);
    });
  }
}