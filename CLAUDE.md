# Consilium — Claude Instructions

## Design Philosophy
- Design with future extensibility in mind
- Anticipate planned features when making architectural decisions
- Current implementation should not block future extension

## Expertise

You are a TypeScript and MCP (Model Context Protocol) expert. No hand-holding on these topics — write idiomatic, production-quality code from the start.

## Rules

### Ask before acting
Always ask before taking any action — file edits, git commands, terminal commands, anything. Never assume the next step. End every proposal with a question and wait for explicit approval before proceeding.

### Commit after each logical unit of work
Commit as soon as a coherent piece of work is done. Do not batch unrelated changes into one commit. This ensures state is always recoverable.

### Keep documents up to date
When code changes, update relevant documents (CLAUDE.md, SKILL.md, etc.) to reflect the current state.

### Token efficiency
Only read files the task actually touches. Do not speculatively read files to orient yourself. Prefer targeted Grep/Glob over reading multiple files.

## Project

See `README.md` for the full spec.

## Key decisions

- npm workspaces: `packages/*` only; `examples/` contains reference material (sample config, sample specialists); `packages/cli/templates/` holds bundled install defaults (slash commands, `typescript` specialist SKILL.md, `config.json`)
- Transport: StreamableHTTP with per-session transport+McpServer instances (avoids local-path MCP re-entrancy deadlock and supports concurrent clients)
- Specialists are directories: `<specialistsDir>/<name>/SKILL.md` — each specialist must be listed explicitly in `config.json` under `specialists`
- `examples/specialists/security/` and `examples/specialists/performance/` are reference examples only — not built, not run
- Each specialist is its own McpServer at `/<name>`, exposing a single `get_skill` tool; Claude Code connects as `consilium-<name>:get_skill`; all orchestration lives in the slash commands
- `.consilium/config.json` controls gateway behaviour: `gateway.port` (overrides `PORT` env), `gateway.specialistsDir` (default: `.consilium/specialists`), `specialists` (required array of `{ name, url }`; local entries use `http://localhost:{port}/{name}`, remote entries use any reachable URL)
- `consilium start` writes per-specialist `consilium-<name>` entries to `.claude/settings.json`; `consilium stop` removes them
- Slash commands use `cs:` prefix to avoid collision with other project commands; installed to `.claude/commands/cs/` — Claude Code derives the namespace from the subdirectory name
- Plans stored at `.consilium/plans/<feature-name>/plan.md`; feature name is a kebab-case slug derived from the description
- Specialist consultation uses sub-agents — the sub-agent reads SKILL.md itself (local: Read tool; remote: get_skill MCP call); only the distilled result returns to main Claude; SKILL.md never enters the main context; cs:plan asks whether main Claude should pre-curate codebase context (files enter main context but sub-agents cost fewer tokens) or let sub-agents explore freely (main context stays clean)
- TS2589 workaround: `as any` cast on `server.registerTool` — MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
- Session ID must be pre-generated before `handleRequest` — generate UUID upfront, pass via closure to `sessionIdGenerator`, use same value as map key; reading `transport.sessionId` after the fact stores `undefined`
- Integration tests in `test/` using `node:test`; run with `npm test` (builds first); `test/helpers/` provides `createTestEnv()`, `startGateway()`, and MCP request helpers for reuse across test files
- OAuth: optional `auth.issuer` + `auth.audience` in config enables Bearer token validation via `jose`; JWKS discovered from issuer OIDC metadata; `/.well-known/oauth-protected-resource` always unauthenticated (RFC 9728); local gateways omit `auth` entirely
