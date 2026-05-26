import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GATEWAY_ENTRY = join(ROOT, "packages/gateway/dist/index.js");

/**
 * Creates an isolated temp environment for a test run.
 * The gateway is started with this dir as cwd, so it auto-discovers
 * specialists from .consilium/specialists/ inside it.
 */
export function createTestEnv() {
  const dir = join(tmpdir(), `consilium-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".consilium", "specialists"), { recursive: true });

  return {
    dir,
    addSpecialist(name, skillContent) {
      mkdirSync(join(dir, ".consilium", "specialists", name), { recursive: true });
      writeFileSync(join(dir, ".consilium", "specialists", name, "SKILL.md"), skillContent);
    },
    setConfig(config) {
      writeFileSync(join(dir, ".consilium", "config.json"), JSON.stringify(config, null, 2));
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Spawns the gateway in the background and resolves once it is listening.
 * Returns the child process; call proc.kill() to stop it.
 */
export function startGateway(cwd, port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [GATEWAY_ENTRY], {
      cwd,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("listening on port")) resolve(proc);
    });
    proc.on("error", reject);
    setTimeout(() => reject(new Error(`Gateway did not start within 5s:\n${stderr}`)), 5000);
  });
}