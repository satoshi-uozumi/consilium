#!/usr/bin/env node
import { spawn } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');
const SPECIALISTS_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'specialists');
const CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'config.json');

interface RemoteSpecialist {
  name: string;
  url: string;
}

interface ConsiliumConfig {
  port?: number;
  local?: {
    specialistsDir?: string;
    specialists?: string[];
  };
  remote?: RemoteSpecialist[];
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

function discoverLocalSpecialists(cwd: string, specialistsDir: string): string[] {
  const dir = path.join(cwd, specialistsDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name);
}

function resolveSpecialists(cwd: string, config: ConsiliumConfig): { local: string[]; remote: RemoteSpecialist[] } {
  const specialistsDir = config.local?.specialistsDir ?? '.consilium/specialists';
  const remote = config.remote ?? [];
  if (!config.local?.specialists) {
    return { local: discoverLocalSpecialists(cwd, specialistsDir), remote };
  }
  const local = config.local.specialists.filter((name) => {
    const exists = fs.existsSync(path.join(cwd, specialistsDir, name, 'SKILL.md'));
    if (!exists) console.warn(`warning: specialist "${name}" has no SKILL.md — skipping`);
    return exists;
  });
  return { local, remote };
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

  const commandsDir = path.join(cwd, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const file of fs.readdirSync(TEMPLATES_DIR)) {
    fs.copyFileSync(path.join(TEMPLATES_DIR, file), path.join(commandsDir, file));
  }
  console.log('Installed slash commands → .claude/commands/');

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

function start(): void {
  const cwd = process.cwd();
  const pidFile = path.join(cwd, '.consilium', 'gateway.pid');

  if (fs.existsSync(pidFile)) {
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
  const port = config.port ?? 4000;
  const { local, remote } = resolveSpecialists(cwd, config);

  if (local.length > 0) {
    const gatewayEntry = require.resolve('@consilium/gateway');
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
  } else {
    console.log('No local specialists — skipping gateway.');
  }

  // Register per-specialist MCP entries in .claude/settings.json
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  const settings = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>)
    : {};
  const mcpServers = ((settings.mcpServers as Record<string, unknown>) ?? {});

  for (const name of local) {
    mcpServers[`consilium-${name}`] = { type: 'http', url: `http://localhost:${port}/${name}` };
  }
  for (const r of remote) {
    mcpServers[`consilium-${r.name}`] = { type: 'http', url: r.url };
  }

  settings.mcpServers = mcpServers;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const allNames = [...local, ...remote.map((r) => r.name)];
  if (allNames.length > 0) {
    console.log(`Registered specialists: ${allNames.join(', ')}`);
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

  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers) {
      for (const key of Object.keys(mcpServers)) {
        if (key === 'consilium' || key.startsWith('consilium-')) delete mcpServers[key];
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      console.log('Removed MCP entries from .claude/settings.json');
    }
  }
}

function uninstall(): void {
  const cwd = process.cwd();

  const consiliumDir = path.join(cwd, '.consilium');
  if (fs.existsSync(consiliumDir)) {
    fs.rmSync(consiliumDir, { recursive: true, force: true });
    console.log('Removed .consilium/');
  }

  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers) {
      for (const key of Object.keys(mcpServers)) {
        if (key === 'consilium' || key.startsWith('consilium-')) delete mcpServers[key];
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      console.log('Removed MCP entries from .claude/settings.json');
    }
  }

  const commandsDir = path.join(cwd, '.claude', 'commands');
  if (fs.existsSync(commandsDir) && fs.existsSync(TEMPLATES_DIR)) {
    for (const file of fs.readdirSync(TEMPLATES_DIR)) {
      const target = path.join(commandsDir, file);
      if (fs.existsSync(target)) fs.rmSync(target);
    }
    console.log('Removed slash commands from .claude/commands/');
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
program.command('start').description('Start the gateway and register specialist MCP servers').action(start);
program.command('stop').description('Stop the gateway and remove specialist MCP servers').action(stop);

program.parse();