# Consilium

Smaller context means more accurate results. Loading all domain expertise into one Claude session doesn't just risk hitting the context limit — it degrades output quality from the first token.

Consilium routes specialist consultations through sub-agents — security, performance, TypeScript idioms, whatever you need. Each specialist gets a clean, focused context and returns only a distilled answer. Your main session never accumulates domain knowledge it isn't actively using.

Every other MCP tool aggregates more servers into one endpoint, making the context problem worse. Consilium treats context budget as a first-class constraint.

## Prerequisites

- [Claude Code](https://claude.ai/code)
- Node.js 20+

## Install

Clone and build once:

```sh
git clone https://github.com/your-org/consilium.git
cd consilium
npm install
npm run build
npm link --workspace=packages/cli   # makes `consilium` available globally
```

Then run this in any project where you want Consilium:

```sh
consilium install
```

This sets up the project for Consilium use:

```
.consilium/
├── config.json                        ← default config (port, specialistsDir, specialists list)
├── plans/                             ← where feature plans are written
└── specialists/
    └── typescript/SKILL.md            ← bundled default specialist (general TypeScript)

.claude/
└── commands/
    └── cs/
        ├── consult.md                 ← /cs:consult
        ├── review.md                  ← /cs:review
        ├── work.md                    ← /cs:work
        └── done.md                    ← /cs:done

.gitignore                             ← .consilium/ appended
```

Existing files are never overwritten — safe to re-run. MCP servers are **not** registered at install time — run `consilium start` to start the gateway and register specialists.

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

Claude Code suggests relevant specialists (e.g. security, performance), consults each via a sub-agent, reconciles any conflicts, and writes `.consilium/plans/user-auth/plan.md`.

## Why multiple specialists?

A single agent has no internal disagreement to surface. Two specialists with different domain instincts produce genuine conflicts — and the reconciliation process catches design decisions that would otherwise be implicit.

Real example from a consultation on adding observability to the gateway:

```
Conflicts to resolve:
- Log format: TypeScript specialist → JSONL; MCP specialist → TSV.
  Surfacing this for you.
- mkdirSync placement: TypeScript says once at startup; MCP says
  per-invocation. Clear winner: startup. Reconciled.
- direction field: MCP proposed it for future output tracking.
  Gateway can't see output tokens (they live in Claude's inference)
  — omit until output tracking is feasible. Reconciled.
```

The `direction` field rejection is the kind of insight a single-agent approach would miss: MCP specialist proposed it, TypeScript specialist didn't, and the synthesis correctly killed it for a real architectural reason. You get the conflict surfaced, not buried.

## Specialists

A specialist is a directory with a single `SKILL.md` file that defines domain expertise. Each specialist runs as its own MCP server, served at `/<name>` on the gateway port. Claude Code connects to each specialist independently as `consilium-<name>`.

By default the bundled `config.json` lists specialists explicitly under `local.specialists`. To load all specialists in the directory automatically, remove that field — the gateway will discover every subdirectory with a `SKILL.md`.

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
consilium start         # spawns gateway in the background, registers per-specialist MCP entries
consilium start -f      # foreground mode — logs stream to terminal, Ctrl+C stops and deregisters
consilium stop          # stops background gateway, removes MCP entries
```

`consilium start` reads `.consilium/config.json` (if present), discovers local specialists, starts the gateway as a background Node process, and writes one `consilium-<name>` MCP entry per specialist into `.claude/settings.json`. `consilium stop` reverses both steps.

Use `consilium start -f` (or `--foreground`) when you want to see gateway logs directly or debug specialist behaviour.

For remote specialists, no local gateway is needed — `consilium start` registers their URLs directly in `.claude/settings.json` and skips the gateway.

### Configuration

`.consilium/config.json` is created by `consilium install`. Edit it to control gateway behaviour:

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

| Field                  | Default                    | Description                                        |
|------------------------|----------------------------|----------------------------------------------------|
| `port`                 | `PORT` env or `4000`       | Port the gateway listens on                        |
| `local.specialistsDir` | `.consilium/specialists`   | Directory to discover local specialists from       |
| `local.specialists`    | _(auto-discover all)_      | Explicit list of local specialists to load         |
| `remote`               | _(none)_                   | Remote specialists — `{ name, url }` array         |
| `auth.issuer`          | _(none)_                   | OAuth authorization server URL (enables auth)      |
| `auth.audience`        | _(none)_                   | Expected `aud` claim in bearer tokens              |

All fields are optional. With no config file the gateway auto-discovers every specialist found in `local.specialistsDir`. Remote specialists are registered directly in `.claude/settings.json` by `consilium start` — the local gateway does not proxy them.

### OAuth (remote gateways only)

When `auth` is set, the gateway requires a valid Bearer token on every request. Omit `auth` for local gateways — no token needed.

```json
{
  "auth": {
    "issuer": "https://accounts.google.com",
    "audience": "consilium-gateway"
  }
}
```

The gateway validates tokens against the issuer's JWKS endpoint (discovered via OIDC). Claude Code handles the token acquisition flow natively — it reads the `/.well-known/oauth-protected-resource` metadata the gateway exposes and runs the OAuth exchange automatically.

## Uninstall

```sh
consilium uninstall
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