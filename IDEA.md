# IDEA.md

## Consilium — Composable Expertise for Claude Code

### Core idea

Specialist MCP servers that extend Claude Code's domain knowledge on demand, without writing to CLAUDE.md.

Each specialist ships with a default SKILL.md defining its expertise (security, performance, accessibility, framework-specific knowledge, etc.). SKILL.md is loaded dynamically per request and can be overridden by the user — no server restart needed.

### Problem it solves

CLAUDE.md grows into a monolith as projects accumulate context. Specialists let you compose expertise as needed — bring in a security specialist for one session, a Litestar expert for another — then unregister when done. Or keep them permanently. The choice is yours.

### Installation & specialist storage

Installing Consilium creates a `.consilium/` folder — the local home for specialists. Specialist servers, SKILL.md overrides, and MCP registrations all live here. Naturally gitignored (developer tooling, not project artifacts).

Remote MCP servers are also supported — config determines whether a specialist is local or remote. Local for private/customized specialists, remote for shared team or published specialists.

### Transport: Docker + StreamableHTTP

Registering MCP servers by local path doesn't work — `sampling/createMessage` cannot be called from within a tool-call context because Claude Code and the MCP host run in the same process, causing a re-entrancy deadlock. This is the same issue arch-forge hit and solved with Docker.

Specialists run as Docker containers using `StreamableHTTP` transport. `docker compose run` spins up a specialist on demand, Claude Code talks to it over HTTP, container stops when done. No persistent stack required.

### Specialist selection

Claude Code suggests which specialists are relevant based on conversation context — e.g., "this touches security and ORM patterns — want me to bring in those specialists?" The user confirms before any server starts.

Users can also request specialists explicitly: `@security-specialist review this endpoint`.

Specialists are started on demand via `docker compose run` — no persistent stack required. Each container is spun up for the consultation and stopped when done.

### Orchestration across multiple specialists

When a topic spans multiple domains, Claude Code interviews each specialist and collects their perspectives. The output is structured with a section per specialist plus an explicit **Conflicts / Tradeoffs** section where disagreements are surfaced rather than silently resolved.

- Conflicts that are human judgment calls → surfaced as-is for the user to decide
- Conflicts with an objectively better answer → Claude Code mediates and produces a single reconciled recommendation

Specialists don't need to see each other's output — Claude Code holds the full picture and decides what to reconcile vs. what to surface.

### Workflow

Consilium is self-contained with its own lifecycle (inspired by claude-python's workflow pattern, not dependent on it):

```
consult specialists → plan.md → work → post-generate review → done (archive)
```

- **consult** — describe what you want. Claude Code suggests specialists, user confirms. Specialists consulted in turn, conflicts surfaced. Output: `plan.md`. Specialists own both the decisions/recommendations and the task list — Claude Code facilitates, not authors.
- **work** — execute tasks from `plan.md` one by one with verification after each change.
- **post-generate review** — specialists brought back to verify generated code matches the plan. Reject with feedback → retry.
- **done** — archive the plan, capture solution docs.

`plan.md` is the handoff contract between the planning phase (specialists) and the execution phase (Claude Code).

### From plan to code

Specialists generate `plan.md` with both domain decisions and implementation tasks. Unspecialized Claude Code implements it. The gap: Claude Code might violate domain-specific *how* even when the *what* is clear.

**Preferred approach: post-generate review loop** — bring specialists back after code is written to verify implementation matches the plan. Reject with feedback, retry until approved (same pattern as arch-forge's reviewer plugin). Reliable because the specialist reviews actual code, not just trusting Claude Code's interpretation of the plan.

**Alternative (deferred):** Recommendations section in the plan — soft guidance Claude Code follows by default, no hard enforcement. Less reliable but lower overhead.

### Nice to have (inspired by claude-python)

Ideas worth considering once the core is stable:

- **`/consult --parallel`** — spawn all specialists simultaneously instead of sequentially. Default is sequential (cheaper), parallel for speed.
- **`/investigate`** — root-cause analysis with relevant specialists. A security specialist and ORM specialist investigating a bug together beats generic Claude Code.
- **`/audit`** — full project health check across all registered specialists simultaneously.
- **Supervisor agent** — synthesizes all specialist outputs into a consolidated report, resolving conflicts and producing a single health score. Useful when many specialists are involved.

### Implementation language

TypeScript — for consistency with arch-forge and the broader ecosystem.

### Relationship to claude-python

`claude-python` (`/c/Users/satoshi.uozumi/projects/claude-python`) is the proof that the skill concept works — domain skills via SKILL.md, Iron Laws, hooks, and a full workflow lifecycle. The new idea is the generalized, MCP-native version of it:

| | claude-python | new idea |
|---|---|---|
| Delivery | Plugin (static) | MCP server (dynamic) |
| SKILL.md | Hardcoded per skill | Default + user override |
| Scope | Python only | Any domain |
| Activation | Auto or CLAUDE.md | On-demand, no CLAUDE.md needed |
| Cross-domain | No | Yes, with conflict surfacing |

`claude-python` stays as-is. The new project generalizes the pattern.

### Relationship to arch-forge

A separate product that shares the same underlying pattern. arch-forge is about generating software artifacts via a pipeline. This is about how Claude Code acquires domain knowledge for any task — no pipeline required. The specialist system could power arch-forge domain servers, but works independently too.