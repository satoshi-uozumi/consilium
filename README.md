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

`SKILL.md` should describe the domain, the review criteria, and the output format expected of the specialist. See `examples/specialists/security/SKILL.md` and `examples/specialists/performance/SKILL.md` in this repo for reference examples.

### Running the gateway — CLI (local)

The simplest way. No Docker required.

```sh
consilium start   # spawns gateway in the background on port 4000
consilium stop    # stops it
```

The gateway runs as a Node process in your project directory. Port is read from `.consilium/config.json` if present, otherwise defaults to 4000.

### Running the gateway — Docker

For containerised or production deployments. `examples/docker-compose.yml` is a reference template — adapt it to your context. The critical piece is the volume mount: map your project's `.consilium/` into the container at `/app/.consilium/`:

```yaml
services:
  consilium-gateway:
    image: consilium-gateway
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
    volumes:
      - ./.consilium:/app/.consilium
```

```sh
docker compose up consilium-gateway
```

### Configuration

Create `.consilium/config.json` to control gateway behaviour:

```json
{
  "port": 4000,
  "specialistsDir": ".consilium/specialists",
  "specialists": ["security", "performance"]
}
```

| Field            | Default                  | Description                                             |
|------------------|--------------------------|---------------------------------------------------------|
| `port`           | `PORT` env or `4000`     | Port the gateway listens on                             |
| `specialistsDir` | `.consilium/specialists` | Directory to discover specialists from                  |
| `specialists`    | _(auto-discover all)_    | Explicit list to load; useful when the library is large |

All fields are optional. With no config file the gateway auto-discovers every specialist found in `specialistsDir`.

## Uninstall

```sh
npx consilium uninstall
```

## Project structure

```
consilium/
├── packages/
│   ├── gateway/          # MCP gateway — discovers and serves specialists
│   └── cli/              # consilium CLI (install / uninstall)
└── examples/
    ├── Dockerfile
    ├── docker-compose.yml
    ├── config.json                  # sample .consilium/config.json
    └── specialists/
        ├── security/SKILL.md        # reference specialist
        └── performance/SKILL.md     # reference specialist
```