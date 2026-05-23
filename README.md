# Consilium

Composable specialist MCP servers for Claude Code. Bring in domain expertise on demand — security, performance, or any custom domain — without bloating your CLAUDE.md.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Claude Code](https://claude.ai/code)

## Install

Run this in any project where you want Consilium:

```sh
npx consilium install
```

This creates `.consilium/plans/`, installs the `/cs:*` slash commands, and registers the specialist MCP servers in `.claude/settings.json`.

## Usage

```
/cs:consult <feature description>   — consult specialists, produce a plan
/cs:review <feature-name>           — specialists review the plan before work (optional)
/cs:work <feature-name>             — execute tasks from the plan
/cs:done <feature-name>             — archive the completed plan
```

**Example:**

```
/cs:consult add JWT authentication to the API
```

Claude Code suggests relevant specialists (e.g. security, performance), consults each via a sub-agent, reconciles any conflicts, and writes `user-auth/plan.md`.

## Specialists

Specialists are Docker containers that expose domain expertise via a single MCP tool (`get_skill`). They run on demand — no persistent stack required.

Start a specialist before running `/cs:consult`:

```sh
docker compose run security    # port 4001
docker compose run performance # port 4002
```

Each specialist ships a default `SKILL.md` that defines its expertise. To override it, place a custom `SKILL.md` in `.consilium/<specialist-name>/SKILL.md`.

To add a third-party or custom specialist, add its MCP entry manually to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "consilium-my-specialist": {
      "type": "http",
      "url": "http://localhost:4003/mcp"
    }
  }
}
```

## Uninstall

```sh
npx consilium uninstall
```

## Project structure

```
consilium/
├── packages/
│   ├── specialist-sdk/   # base SDK — StreamableHTTP server, SKILL.md loader, shared types
│   └── cli/              # consilium CLI (install / uninstall)
├── specialists/
│   ├── security/         # security specialist
│   └── performance/      # performance specialist
├── Dockerfile
└── docker-compose.yml
```