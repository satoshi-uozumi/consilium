# Consilium

Composable specialist MCP servers for Claude Code. Bring in domain expertise on demand — security, performance, or any custom domain — without bloating your CLAUDE.md.

## Prerequisites

- [Claude Code](https://claude.ai/code)

## Install

Run this in any project where you want Consilium:

```sh
npx consilium install
```

This creates `.consilium/plans/` and `.consilium/specialists/`, installs the `/cs:*` slash commands, and adds `.consilium/` to `.gitignore`.

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

A specialist is a directory with a single `SKILL.md` file that defines domain expertise. Each specialist runs as its own MCP server, served at `/<name>` on the gateway port. Claude Code connects to each specialist independently as `consilium-<name>`.

### Adding a specialist

Create a directory under `.consilium/specialists/` and write a `SKILL.md`:

```
.consilium/
└── specialists/
    └── architecture/
        └── SKILL.md
```

`SKILL.md` should describe the domain, the review criteria, and the output format expected of the specialist. See `examples/specialists/security/SKILL.md` and `examples/specialists/performance/SKILL.md` in this repo for reference examples.

### Running the gateway

```sh
consilium start   # spawns gateway, registers per-specialist MCP entries in .claude/settings.json
consilium stop    # stops gateway, removes MCP entries
```

`consilium start` reads `.consilium/config.json` (if present), discovers local specialists, starts the gateway as a background Node process, and writes one `consilium-<name>` MCP entry per specialist into `.claude/settings.json`. `consilium stop` reverses both steps.

For remote specialists, no local gateway is needed — `consilium start` registers their URLs directly in `.claude/settings.json` and skips the gateway.

### Configuration

Create `.consilium/config.json` to control gateway behaviour:

```json
{
  "port": 4000,
  "local": {
    "specialistsDir": ".consilium/specialists",
    "specialists": ["security"]
  },
  "remote": [
    { "name": "infra", "url": "http://remote-host:4000/infra" }
  ]
}
```

| Field                    | Default                  | Description                                              |
|--------------------------|--------------------------|----------------------------------------------------------|
| `port`                   | `PORT` env or `4000`     | Port the gateway listens on                              |
| `local.specialistsDir`   | `.consilium/specialists` | Directory to discover local specialists from             |
| `local.specialists`      | _(auto-discover all)_    | Explicit list of local specialists to load               |
| `remote`                 | _(none)_                 | Remote specialists — `{ name, url }` each served elsewhere |

All fields are optional. With no config file the gateway auto-discovers every specialist found in `local.specialistsDir`. Remote specialists are registered directly in `.claude/settings.json` by `consilium start` — the local gateway does not proxy them.

## Uninstall

```sh
npx consilium uninstall
```

## Project structure

```
consilium/
├── packages/
│   ├── gateway/          # MCP gateway — multiplexes specialists, one McpServer per path
│   └── cli/              # consilium CLI (install / start / stop / uninstall)
├── test/
│   ├── helpers/          # reusable startGateway() and MCP request helpers
│   └── *.test.mjs        # integration tests (node:test)
└── examples/
    ├── config.json                  # sample .consilium/config.json
    └── specialists/
        ├── security/SKILL.md        # reference specialist
        └── performance/SKILL.md     # reference specialist
```

## Development

```sh
npm run build   # compile TypeScript
npm test        # build + run integration tests
```