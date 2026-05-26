#!/usr/bin/env node
import { spawn } from 'child_process';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const CONSILIUM_MCP_SERVERS: Record<string, { type: string; url: string }> = {
  'consilium': { type: 'http', url: 'http://localhost:4000/mcp' },
};

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');

function install(): void {
  const cwd = process.cwd();

  fs.mkdirSync(path.join(cwd, '.consilium', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.consilium', 'specialists'), { recursive: true });
  console.log('Created .consilium/plans/ and .consilium/specialists/');

  const commandsDir = path.join(cwd, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  for (const file of fs.readdirSync(TEMPLATES_DIR)) {
    fs.copyFileSync(path.join(TEMPLATES_DIR, file), path.join(commandsDir, file));
  }
  console.log('Installed slash commands → .claude/commands/');

  const clauseDir = path.join(cwd, '.claude');
  fs.mkdirSync(clauseDir, { recursive: true });
  const settingsPath = path.join(clauseDir, 'settings.json');
  const settings = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>)
    : {};
  const mcpServers = ((settings.mcpServers as Record<string, unknown>) ?? {});
  for (const [name, config] of Object.entries(CONSILIUM_MCP_SERVERS)) {
    mcpServers[name] = config;
  }
  settings.mcpServers = mcpServers;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Registered MCP servers → .claude/settings.json');

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

function readPort(cwd: string): number {
  const configPath = path.join(cwd, '.consilium', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      if (typeof config.port === 'number') return config.port;
    } catch {}
  }
  return 4000;
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
      fs.rmSync(pidFile); // stale PID file
    }
  }

  const port = readPort(cwd);
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
}

function stop(): void {
  const pidFile = path.join(process.cwd(), '.consilium', 'gateway.pid');

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
program.command('start').description('Start the gateway in the background').action(start);
program.command('stop').description('Stop the gateway').action(stop);

program.parse();