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
git clone https://github.com/satoshi-uozumi/consilium.git
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
├── config.json                        ← default config (gateway port, specialistsDir, specialists)
├── README.md                          ← extension guide (for humans and AI)
├── plans/                             ← where feature plans are written
└── specialists/
    └── typescript/SKILL.md            ← bundled default specialist (general TypeScript)

.claude/
└── commands/
    └── cs/
        ├── plan.md                    ← /cs:plan
        ├── review.md                  ← /cs:review
        ├── work.md                    ← /cs:work
        └── done.md                    ← /cs:done

.gitignore                             ← .consilium/ appended
```

Existing files are never overwritten — safe to re-run. MCP servers are **not** registered at install time — run `consilium start` to start the gateway and register specialists.

## Usage

```
/cs:plan <feature description>   — consult specialists, produce a plan
/cs:review <feature-name>           — specialists review the plan before work (optional)
/cs:work <feature-name>             — execute tasks from the plan
/cs:done <feature-name>             — archive the completed plan
```

**Example:**

```
/cs:plan add JWT authentication to the API
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

Each specialist must be listed explicitly in `config.json` under `specialists`.

### Adding a specialist

Create a directory under `.consilium/specialists/` and write a `SKILL.md`:

```
.consilium/
└── specialists/
    └── architecture/
        └── SKILL.md
```

`SKILL.md` should describe the domain, the review criteria, and the output format expected of the specialist. See the bundled `security` specialist in `.consilium/specialists/security/SKILL.md` after `consilium install` for a reference example.

### Running the gateway

```sh
consilium start         # starts gateway in the foreground — logs stream to terminal, Ctrl+C stops and deregisters
consilium start -d      # detach mode — spawns gateway in the background, registers per-specialist MCP entries
consilium stop          # stops background gateway, removes MCP entries
```

`consilium start` reads `.consilium/config.json` (if present), discovers local specialists, starts the gateway in the foreground, and writes one `consilium-<name>` MCP entry per specialist into `.claude/settings.json`. `consilium stop` reverses both steps.

Use `consilium start -d` (or `--detach`) to run the gateway as a background daemon and reclaim the terminal.

For remote specialists, no local gateway is needed — `consilium start` registers their URLs directly in `.claude/settings.json` and skips the gateway.

### Configuration

`.consilium/config.json` is created by `consilium install`. It lists your specialists:

```json
{
  "specialists": [
    { "name": "typescript" },
    { "name": "security", "url": "http://localhost:4000/security" },
    { "name": "infra", "url": "http://remote-host:4000/infra" }
  ]
}
```

| Specialist entry              | Behaviour                                                      |
|-------------------------------|----------------------------------------------------------------|
| `{ "name": "..." }`           | Local — sub-agents read SKILL.md directly, no gateway needed   |
| `{ "name": "...", "url": "http://localhost/..." }` | Gateway-served — accessible via MCP, requires `consilium start` |
| `{ "name": "...", "url": "http://remote/..." }` | Remote — registered in `settings.json`, remote gateway serves it |

`consilium start` registers MCP entries for all specialists with URLs, and starts the local gateway only if any URL points to localhost.

### Gateway configuration (server mode only)

To serve specialists via the local gateway, create `.consilium/gateway.json`:

```json
{
  "port": 4000,
  "specialistsDir": ".consilium/specialists"
}
```

| Field           | Default                  | Description                              |
|-----------------|--------------------------|------------------------------------------|
| `port`          | `PORT` env or `4000`     | Port the gateway listens on              |
| `specialistsDir`| `.consilium/specialists` | Directory containing specialist SKILL.md files |
| `auth.issuer`   | _(none)_                 | OAuth authorization server URL (enables Bearer token validation) |
| `auth.audience` | _(none)_                 | Expected `aud` claim in bearer tokens    |

The gateway validates tokens against the issuer's JWKS endpoint (discovered via OIDC). Claude Code handles the token acquisition flow natively.

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
└── test/
    ├── helpers/          # reusable startGateway() and MCP request helpers
    └── *.test.mjs        # integration tests (node:test)
```

## Development

```sh
npm run build   # compile TypeScript
npm test        # build + run integration tests
```