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

This creates `.consilium/plans/`, installs the `/cs:*` slash commands, and registers the gateway MCP server in `.claude/settings.json`.

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

A specialist is a directory with a single `SKILL.md` file that defines domain expertise. The gateway discovers specialists automatically from `.consilium/specialists/` in your project and exposes each as a namespaced MCP tool (`<name>__get_skill`).

### Adding a specialist

Create a directory under `.consilium/specialists/` and write a `SKILL.md`:

```
.consilium/
└── specialists/
    └── architecture/
        └── SKILL.md
```

`SKILL.md` should describe the domain, the review criteria, and the output format expected of the specialist. See `specialists/security/SKILL.md` and `specialists/performance/SKILL.md` in this repo for reference examples.

### Running the gateway

Start the gateway before running `/cs:consult`:

```sh
docker compose run gateway     # port 4000
```

The gateway scans `.consilium/specialists/` at startup and loads whatever it finds. No configuration needed — add a directory, restart the gateway.

## Uninstall

```sh
npx consilium uninstall
```

## Project structure

```
consilium/
├── packages/
│   ├── specialist-sdk/   # base SDK — StreamableHTTP server, SKILL.md loader, shared types
│   ├── gateway/          # aggregates all specialists into a single MCP server
│   └── cli/              # consilium CLI (install / uninstall)
├── specialists/
│   ├── security/         # security specialist
│   └── performance/      # performance specialist
├── Dockerfile
└── docker-compose.yml
```