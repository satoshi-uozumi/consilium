import fs from "fs";
import http from "http";
import path from "path";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type AuthConfig, validateBearerToken, protectedResourceMetadata } from "./auth.js";

const DEFAULT_SPECIALISTS_DIR = ".consilium/specialists";

interface SpecialistEntry {
  name: string;
  url: string;
}

interface GatewayConfig {
  gateway?: {
    port?: number;
    specialistsDir?: string;
  };
  specialists?: SpecialistEntry[];
  auth?: AuthConfig;
}

function isLocal(url: string, port: number): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.port === String(port);
  } catch {
    return false;
  }
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

    const known = new Set(["gateway", "specialists", "auth"]);
    for (const key of Object.keys(raw)) {
      if (!known.has(key)) {
        process.stderr.write(`[consilium-gateway] warning: unknown config key "${key}" — ignored\n`);
      }
    }

    const config: GatewayConfig = {};

    if ("gateway" in raw) {
      if (raw.gateway === null || typeof raw.gateway !== "object") {
        process.stderr.write(`[consilium-gateway] warning: config "gateway" must be an object — ignored\n`);
      } else {
        const gw = raw.gateway as Record<string, unknown>;
        config.gateway = {};
        if ("port" in gw) {
          if (typeof gw.port !== "number") {
            process.stderr.write(`[consilium-gateway] warning: config "gateway.port" must be a number — ignored\n`);
          } else {
            config.gateway.port = gw.port;
          }
        }
        if ("specialistsDir" in gw) {
          if (typeof gw.specialistsDir !== "string") {
            process.stderr.write(`[consilium-gateway] warning: config "gateway.specialistsDir" must be a string — ignored\n`);
          } else {
            config.gateway.specialistsDir = gw.specialistsDir;
          }
        }
      }
    }

    if ("specialists" in raw) {
      if (!Array.isArray(raw.specialists)) {
        process.stderr.write(`[consilium-gateway] warning: config "specialists" must be an array — ignored\n`);
      } else {
        const entries: SpecialistEntry[] = [];
        for (const item of raw.specialists) {
          if (
            item !== null &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).name === "string" &&
            typeof (item as Record<string, unknown>).url === "string"
          ) {
            entries.push(item as SpecialistEntry);
          } else {
            process.stderr.write(`[consilium-gateway] warning: invalid specialist entry — must be { name, url } — skipping\n`);
          }
        }
        config.specialists = entries;
      }
    }

    if ("auth" in raw) {
      if (raw.auth === null || typeof raw.auth !== "object") {
        process.stderr.write(`[consilium-gateway] warning: config "auth" must be an object — ignored\n`);
      } else {
        const a = raw.auth as Record<string, unknown>;
        if (typeof a.issuer !== "string" || typeof a.audience !== "string") {
          process.stderr.write(`[consilium-gateway] warning: config "auth" requires string fields "issuer" and "audience" — ignored\n`);
        } else {
          config.auth = { issuer: a.issuer, audience: a.audience };
        }
      }
    }

    return config;
  }

  private resolveLocalNames(names: string[], specialistsDir: string): string[] {
    return names.filter((name) => {
      const exists = fs.existsSync(path.resolve(process.cwd(), specialistsDir, name, "SKILL.md"));
      if (!exists) process.stderr.write(`[consilium-gateway] warning: specialist "${name}" has no SKILL.md in ${specialistsDir} — skipping\n`);
      return exists;
    });
  }

  private createSpecialistServer(name: string, specialistsDir: string): McpServer {
    const server = new McpServer({ name, version: "0.1.0" });
    // TS2589: MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server.registerTool as any)(
      "get_skill",
      { description: `Return the SKILL.md for the ${name} specialist` },
      async () => ({ content: [{ type: "text" as const, text: loadSkill(name, specialistsDir) }] })
    );
    return server;
  }

  start(): Promise<void> {
    const config = this.loadConfig();
    const port = config.gateway?.port ?? this.defaultPort;
    const specialistsDir = config.gateway?.specialistsDir ?? DEFAULT_SPECIALISTS_DIR;
    const auth = config.auth;

    if (auth) {
      process.stderr.write(`[consilium-gateway] auth enabled — issuer: ${auth.issuer}\n`);
    }

    if (!config.specialists || config.specialists.length === 0) {
      process.stderr.write(`[consilium-gateway] warning: no specialists configured — add entries to .consilium/config.json\n`);
    }

    const allSpecialists = config.specialists ?? [];
    const local = allSpecialists.filter((e) => isLocal(e.url, port));
    const remote = allSpecialists.filter((e) => !isLocal(e.url, port));
    const localNames = this.resolveLocalNames(local.map((e) => e.name), specialistsDir);

    if (localNames.length > 0) {
      process.stderr.write(`[consilium-gateway] serving: ${localNames.join(", ")}\n`);
    }
    if (remote.length > 0) {
      process.stderr.write(`[consilium-gateway] remote (not served here): ${remote.map((e) => e.name).join(", ")}\n`);
    }

    // Per-specialist session pools: name → (sessionId → transport)
    const allSessions = new Map<string, Map<string, StreamableHTTPServerTransport>>();
    for (const name of localNames) {
      allSessions.set(name, new Map());
    }

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

        const urlPath = (req.url ?? "/").split("?")[0];

        // OAuth Protected Resource Metadata (RFC 9728) — always unauthenticated
        if (auth && urlPath === "/.well-known/oauth-protected-resource") {
          const gatewayUrl = `http://${req.headers.host}`;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(protectedResourceMetadata(gatewayUrl, auth)));
          return;
        }

        // Validate Bearer token when auth is configured
        if (auth) {
          try {
            await validateBearerToken(req.headers.authorization, auth);
          } catch {
            const gatewayUrl = `http://${req.headers.host}`;
            res.writeHead(401, {
              "Content-Type": "application/json",
              "WWW-Authenticate": `Bearer realm="consilium", resource_metadata="${gatewayUrl}/.well-known/oauth-protected-resource"`,
            });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }
        }

        // Route by first path segment: /<specialist-name>[/...]
        const specialistName = urlPath.split("/").filter(Boolean)[0];

        if (!specialistName || !allSessions.has(specialistName)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Specialist not found" }));
          return;
        }

        const sessions = allSessions.get(specialistName)!;
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (req.method === "POST" && !sessionId) {
          const sid = randomUUID();
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => sid });
          transport.onclose = () => sessions.delete(sid);
          await this.createSpecialistServer(specialistName, specialistsDir).connect(transport);
          sessions.set(sid, transport);
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