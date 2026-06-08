#!/usr/bin/env node
import { spawn } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');
const SPECIALISTS_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'specialists');
const CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'config.json');
const GATEWAY_CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'gateway.json');
const README_TEMPLATE = path.join(__dirname, '..', 'templates', 'README.md');

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

function readGatewayConfig(cwd: string): GatewayConfig {
  const configPath = path.join(cwd, '.consilium', 'gateway.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as GatewayConfig;
  } catch {
    return {};
  }
}

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
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

  // Sample gateway config — skip if already present
  const gatewayConfigDest = path.join(cwd, '.consilium', 'gateway.json');
  if (!fs.existsSync(gatewayConfigDest)) {
    fs.copyFileSync(GATEWAY_CONFIG_TEMPLATE, gatewayConfigDest);
    console.log('Created .consilium/gateway.json (sample — only needed for server mode)');
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

  console.log('\nConsilium installed. Use /cs:plan to get started.');
}

function registerMcpEntries(cwd: string, specialists: { name: string; url: string }[]): void {
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
  const specialists = config.specialists ?? [];
  const withUrl = specialists.filter((s): s is { name: string; url: string } => !!s.url);

  if (withUrl.length === 0) {
    console.log('No specialists with URLs configured — nothing to register.');
    return;
  }

  registerMcpEntries(cwd, withUrl);

  const needsGateway = withUrl.some((s) => isLocalUrl(s.url));
  if (!needsGateway) return;

  const gwConfig = readGatewayConfig(cwd);
  const port = gwConfig.port ?? 4000;
  const gatewayEntry = require.resolve('@consilium/gateway');

  if (foreground) {
    const child = spawn(process.execPath, [gatewayEntry], {
      stdio: ['ignore', 'inherit', 'inherit'],
      cwd,
      env: { ...process.env, PORT: String(port) },
    });

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
  }
}

function stop(): void {
  const cwd = process.cwd();
  const pidFile = path.join(cwd, '.consilium', 'gateway.pid');

  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try {
      process.kill(pid);
      console.log(`Gateway stopped (PID ${pid})`);
    } catch {
      console.log('Gateway process not found — removing stale PID file.');
    }
    fs.rmSync(pidFile);
  }

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
  .version('0.2.0');

program.command('install').description('Install Consilium into the current project').action(install);
program.command('uninstall').description('Remove Consilium from the current project').action(uninstall);
program.command('start')
  .description('Register specialist MCP servers; start gateway if localhost specialists are configured')
  .option('-d, --detach', 'Run gateway in the background (detached daemon)')
  .action(start);
program.command('stop').description('Stop the gateway and remove specialist MCP entries').action(stop);

program.parse();
