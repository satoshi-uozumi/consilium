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

- Single `Dockerfile`, per-specialist entry points — no separate image per specialist
- npm workspaces: `packages/*` + `specialists/*`
- `docker compose run <specialist>` on demand — no persistent stack
- Transport: StreamableHTTP (avoids local-path MCP re-entrancy deadlock)
- Each specialist ships a default `SKILL.md`, user-overridable via `.consilium/<specialist>/SKILL.md`
- MCP server exposes only `get_skill`; all orchestration lives in the slash commands
- Slash commands use `cs:` prefix to avoid collision with other project commands
- Plans stored at `<feature-name>/plan.md`; feature name is a kebab-case slug derived from the description
- Specialist consultation uses sub-agents — only the distilled result returns to main Claude; SKILL.md never accumulates in the main context
- TS2589 workaround: `reg()` helper in `registerTools()` isolates `as any` cast — MCP SDK 1.29 dual-Zod compat types overflow TS5.9 instantiation depth
