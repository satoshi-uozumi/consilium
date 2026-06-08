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
  url?: string;
}

interface ConsiliumConfig {
  specialists?: SpecialistEntry[];
}

interface GatewayConfig {
  port?: number;
  specialistsDir?: string;
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
  private logStream: fs.WriteStream | null = null;

  constructor(private readonly defaultPort: number) {}

  private log(message: string): void {
    const line = `[consilium-gateway] ${message}\n`;
    process.stderr.write(line);
    this.logStream?.write(line);
  }

  private loadGatewayConfig(): GatewayConfig {
    const configPath = path.resolve(process.cwd(), ".consilium/gateway.json");
    if (!fs.existsSync(configPath)) return {};

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      this.log("warning: failed to parse .consilium/gateway.json — using defaults");
      return {};
    }

    const known = new Set(["port", "specialistsDir", "auth"]);
    for (const key of Object.keys(raw)) {
      if (!known.has(key)) {
        this.log(`warning: unknown gateway config key "${key}" — ignored`);
      }
    }

    const config: GatewayConfig = {};

    if ("port" in raw) {
      if (typeof raw.port !== "number") {
        this.log(`warning: gateway config "port" must be a number — ignored`);
      } else {
        config.port = raw.port;
      }
    }

    if ("specialistsDir" in raw) {
      if (typeof raw.specialistsDir !== "string") {
        this.log(`warning: gateway config "specialistsDir" must be a string — ignored`);
      } else {
        config.specialistsDir = raw.specialistsDir;
      }
    }

    if ("auth" in raw) {
      if (raw.auth === null || typeof raw.auth !== "object") {
        this.log(`warning: gateway config "auth" must be an object — ignored`);
      } else {
        const a = raw.auth as Record<string, unknown>;
        if (typeof a.issuer !== "string" || typeof a.audience !== "string") {
          this.log(`warning: gateway config "auth" requires string fields "issuer" and "audience" — ignored`);
        } else {
          config.auth = { issuer: a.issuer, audience: a.audience };
        }
      }
    }

    return config;
  }

  private loadConsiliumConfig(): ConsiliumConfig {
    const configPath = path.resolve(process.cwd(), ".consilium/config.json");
    if (!fs.existsSync(configPath)) return {};

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      this.log("warning: failed to parse .consilium/config.json — no specialists loaded");
      return {};
    }

    const config: ConsiliumConfig = {};

    if (Array.isArray(raw.specialists)) {
      const entries: SpecialistEntry[] = [];
      for (const item of raw.specialists) {
        if (item !== null && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string") {
          const e = item as Record<string, unknown>;
          entries.push({ name: e.name as string, url: typeof e.url === "string" ? e.url : undefined });
        } else {
          this.log(`warning: invalid specialist entry — must have "name" — skipping`);
        }
      }
      config.specialists = entries;
    }

    return config;
  }

  private resolveLocalNames(names: string[], specialistsDir: string): string[] {
    return names.filter((name) => {
      const exists = fs.existsSync(path.resolve(process.cwd(), specialistsDir, name, "SKILL.md"));
      if (!exists) this.log(`warning: specialist "${name}" has no SKILL.md in ${specialistsDir} — skipping`);
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
    const logPath = path.resolve(process.cwd(), ".consilium/gateway.log");
    this.logStream = fs.createWriteStream(logPath, { flags: "w" });

    const gwConfig = this.loadGatewayConfig();
    const consiliumConfig = this.loadConsiliumConfig();
    const specialists = consiliumConfig.specialists ?? [];
    const port = gwConfig.port ?? this.defaultPort;
    const specialistsDir = gwConfig.specialistsDir ?? DEFAULT_SPECIALISTS_DIR;
    const auth = gwConfig.auth;

    if (auth) {
      this.log(`auth enabled — issuer: ${auth.issuer}`);
    }

    const local = specialists.filter((e) => e.url && isLocal(e.url, port));
    const remote = specialists.filter((e) => e.url && !isLocal(e.url, port));

    if (local.length === 0) {
      this.log(`warning: no local specialists configured for port ${port} — add localhost URLs to config.json`);
    }

    const localNames = this.resolveLocalNames(local.map((e) => e.name), specialistsDir);

    if (localNames.length > 0) {
      this.log(`serving: ${localNames.join(", ")}`);
    }
    if (remote.length > 0) {
      this.log(`remote (not served here): ${remote.map((e) => e.name).join(", ")}`);
    }

    // Per-specialist session pools: name → (sessionId → transport)
    const allSessions = new Map<string, Map<string, StreamableHTTPServerTransport>>();
    for (const name of localNames) {
      allSessions.set(name, new Map());
    }

    return new Promise((resolve, reject) => {
      const httpServer = http.createServer(async (req, res) => {
        const start = Date.now();
        const urlPath = (req.url ?? "/").split("?")[0];
        let sessionNote = "";

        res.on("finish", () => {
          if (req.method === "OPTIONS") return;
          this.log(`${req.method} ${urlPath} ${res.statusCode} ${Date.now() - start}ms${sessionNote}`);
        });

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

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
          sessionNote = ` session=${sid} (new)`;
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
            sessionNote = ` session=${sessionId} (existing)`;
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
              await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
            });
          } else {
            if (req.method === "DELETE") sessionNote = ` session=${sessionId} (closed)`;
            await transport.handleRequest(req, res);
            if (req.method === "DELETE") sessions.delete(sessionId);
          }
        } else {
          res.writeHead(400);
          res.end();
        }
      });

      httpServer.listen(port, () => {
        this.log(`listening on port ${port}`);
        resolve();
      });

      httpServer.on("error", reject);
    });
  }
}
