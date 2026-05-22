# Consilium — Project Scaffold Plan

## Goal

Set up the monorepo structure for Consilium: composable specialist MCP servers for Claude Code.

## Structure

```
consilium/
├── packages/
│   ├── specialist-sdk/          # Base SDK — StreamableHTTP server, SKILL.md loader, shared types
│   └── cli/                     # `consilium` CLI — install, add/remove specialists (lowest priority)
│       └── src/
│           ├── index.ts
│           ├── server.ts
│           ├── skill-loader.ts
│           └── types.ts
├── specialists/                 # Built-in specialists (workspace packages)
│   ├── security/
│   │   ├── src/index.ts
│   │   ├── SKILL.md
│   │   └── package.json
│   └── performance/
│       ├── src/index.ts
│       ├── SKILL.md
│       └── package.json
├── .claude/
│   └── commands/                # Claude Code slash commands
│       ├── consult.md
│       ├── work.md
│       └── done.md
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── package.json
├── tsconfig.json
├── IDEA.md
└── README.md
```

## Tasks

- [x] Root config: `package.json` (workspaces), `tsconfig.json`, `.gitignore`, `.claudeignore`
- [x] Docker: `Dockerfile`, `docker-compose.yml`
- [x] `packages/specialist-sdk`: `package.json`, `tsconfig.json`, `src/types.ts`, `src/server.ts`, `src/skill-loader.ts`, `src/index.ts`
- [x] `specialists/security`: `package.json`, `tsconfig.json`, `src/index.ts`, `SKILL.md`
- [x] `specialists/performance`: `package.json`, `tsconfig.json`, `src/index.ts`, `SKILL.md`
- [x] `.claude/commands/`: `consult.md`, `work.md`, `done.md`
- [ ] Build verified (blocked: OOM on 32-bit Node with TypeScript 5.9.3 — root cause unknown)
- [ ] `packages/cli`: `consilium` CLI — `install`, `add`, `remove` commands (lowest priority; use `npm link` for local dev)

## Key decisions

- Single `Dockerfile`, per-specialist entry points — no separate image per specialist
- npm workspaces: `packages/*` + `specialists/*`
- `docker compose run <specialist>` on demand — no persistent stack
- Transport: StreamableHTTP (avoids local-path MCP re-entrancy deadlock)
- Each specialist ships a default `SKILL.md`, user-overridable
- Claude Code is the mediator — orchestrates via slash commands and SKILL.md, not a separate server
- Distribution: `npm link` for local dev; npm publish or GitHub install for release (deferred)