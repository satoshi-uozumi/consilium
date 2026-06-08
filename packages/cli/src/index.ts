#!/usr/bin/env node
import { spawn } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');
const SPECIALISTS_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'specialists');
const CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'config.json');
const README_TEMPLATE = path.join(__dirname, '..', 'templates', 'README.md');

interface SpecialistEntry {
  name: string;
  url: string;
}

interface ConsiliumConfig {
  gateway?: {
    port?: number;
    specialistsDir?: string;
  };
  specialists?: SpecialistEntry[];
}

function readConfig(cwd: string): ConsiliumConfig {
  const configPath = path.join(cwd, '.consilium', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as ConsiliumConfig;
  } catch {
    return {};
  }
}

function isLocalUrl(url: string, port: number): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === String(port);
  } catch {
    return false;
  }
}

function resolveSpecialists(config: ConsiliumConfig): SpecialistEntry[] {
  return config.specialists ?? [];
}

function install(): void {
  const cwd = process.cwd();

  fs.mkdirSync(path.join(cwd, '.consilium', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.consilium', 'specialists'), { recursive: true });
  console.log('Created .consilium/plans/ and .consilium/specialists/');

  // Default specialists — skip if already present
  for (const name of fs.readdirSync(SPECIALISTS_TEMPLATES_DIR)) {
    const dest = path.join(cwd, '.consilium', 'specialists', name, 'SKILL.md');
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(SPECIALISTS_TEMPLATES_DIR, name, 'SKILL.md'), dest);
      console.log(`Created specialist: ${name}`);
    }
  }

  // Default config — skip if already present
  const configDest = path.join(cwd, '.consilium', 'config.json');
  if (!fs.existsSync(configDest)) {
    fs.copyFileSync(CONFIG_TEMPLATE, configDest);
    console.log('Created .consilium/config.json');
  }

  // README — skip if already present
  const readmeDest = path.join(cwd, '.consilium', 'README.md');
  if (!fs.existsSync(readmeDest)) {
    fs.copyFileSync(README_TEMPLATE, readmeDest);
    console.log('Created .consilium/README.md');
  }

  const commandsDir = path.join(cwd, '.claude', 'commands', 'cs');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const file of fs.readdirSync(TEMPLATES_DIR)) {
    fs.copyFileSync(path.join(TEMPLATES_DIR, file), path.join(commandsDir, file));
  }
  console.log('Installed slash commands → .claude/commands/cs/');

  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '.consilium/';
  if (fs.existsSync(gitignorePath)) {
    const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n');
    if (!lines.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n${entry}\n`);
      console.log('Added .consilium/ to .gitignore');
    }
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
    console.log('Created .gitignore with .consilium/');
  }

  console.log('\nConsilium installed. Run `consilium start` to start the gateway.');
}

function registerMcpEntries(cwd: string, specialists: SpecialistEntry[]): void {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  const settings = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>)
    : {};
  const mcpServers = ((settings.mcpServers as Record<string, unknown>) ?? {});
  for (const s of specialists) {
    mcpServers[`consilium-${s.name}`] = { type: 'http', url: s.url };
  }
  settings.mcpServers = mcpServers;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  if (specialists.length > 0) console.log(`Registered specialists: ${specialists.map((s) => s.name).join(', ')}`);
}

function removeMcpEntries(cwd: string): void {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return;
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers) return;
  for (const key of Object.keys(mcpServers)) {
    if (key === 'consilium' || key.startsWith('consilium-')) delete mcpServers[key];
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Removed MCP entries from .claude/settings.json');
}

function start(options: { detach?: boolean }): void {
  const cwd = process.cwd();
  const pidFile = path.join(cwd, '.consilium', 'gateway.pid');
  const foreground = !options.detach;

  if (!foreground && fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try {
      process.kill(pid, 0);
      console.log(`Gateway already running (PID ${pid})`);
      return;
    } catch {
      fs.rmSync(pidFile);
    }
  }

  const config = readConfig(cwd);
  const port = config.gateway?.port ?? 4000;
  const specialists = resolveSpecialists(config);
  const hasLocal = specialists.some((s) => isLocalUrl(s.url, port));

  if (!hasLocal) {
    console.log('No local specialists — skipping gateway.');
    registerMcpEntries(cwd, specialists);
    return;
  }

  const gatewayEntry = require.resolve('@consilium/gateway');

  if (foreground) {
    const child = spawn(process.execPath, [gatewayEntry], {
      stdio: ['ignore', 'inherit', 'inherit'],
      cwd,
      env: { ...process.env, PORT: String(port) },
    });

    registerMcpEntries(cwd, specialists);

    let cleaned = false;
    const cleanup = (exitCode?: number | null) => {
      if (cleaned) return;
      cleaned = true;
      removeMcpEntries(cwd);
      process.exit(exitCode ?? 0);
    };

    process.on('SIGINT', () => { child.kill('SIGINT'); });
    process.on('SIGTERM', () => { child.kill('SIGTERM'); });
    child.on('exit', (code) => cleanup(code));
  } else {
    const child = spawn(process.execPath, [gatewayEntry], {
      detached: true,
      stdio: 'ignore',
      cwd,
      env: { ...process.env, PORT: String(port) },
    });

    if (!child.pid) {
      console.error('Failed to start gateway.');
      return;
    }

    child.unref();
    fs.writeFileSync(pidFile, String(child.pid));
    console.log(`Gateway started on port ${port} (PID ${child.pid})`);
    registerMcpEntries(cwd, specialists);
  }
}

function stop(): void {
  const cwd = process.cwd();
  const pidFile = path.join(cwd, '.consilium', 'gateway.pid');

  if (!fs.existsSync(pidFile)) {
    console.log('Gateway is not running.');
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  try {
    process.kill(pid);
    console.log(`Gateway stopped (PID ${pid})`);
  } catch {
    console.log('Gateway process not found — removing stale PID file.');
  }
  fs.rmSync(pidFile);

  removeMcpEntries(cwd);
}

function uninstall(): void {
  const cwd = process.cwd();

  const consiliumDir = path.join(cwd, '.consilium');
  if (fs.existsSync(consiliumDir)) {
    fs.rmSync(consiliumDir, { recursive: true, force: true });
    console.log('Removed .consilium/');
  }

  removeMcpEntries(cwd);

  const commandsDir = path.join(cwd, '.claude', 'commands', 'cs');
  if (fs.existsSync(commandsDir) && fs.existsSync(TEMPLATES_DIR)) {
    for (const file of fs.readdirSync(TEMPLATES_DIR)) {
      const target = path.join(commandsDir, file);
      if (fs.existsSync(target)) fs.rmSync(target);
    }
    console.log('Removed slash commands from .claude/commands/cs/');
  }

  console.log('\nConsilium uninstalled.');
}

const program = new Command();

program
  .name('consilium')
  .description('Composable specialist MCP servers for Claude Code')
  .version('0.1.0');

program.command('install').description('Install Consilium into the current project').action(install);
program.command('uninstall').description('Remove Consilium from the current project').action(uninstall);
program.command('start')
  .description('Start the gateway and register specialist MCP servers')
  .option('-d, --detach', 'Run gateway in the background (detached daemon)')
  .action(start);
program.command('stop').description('Stop the gateway and remove specialist MCP servers').action(stop);

program.parse();