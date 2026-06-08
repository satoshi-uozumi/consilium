# Changelog

## 0.2.0 — 2026-06-08

### Breaking changes

- **Config schema redesigned.** `config.json` is now a specialist registry only. The old `local`/`remote` split and `gateway` block are gone.

  **Before:**
  ```json
  {
    "port": 4000,
    "local": { "specialistsDir": ".consilium/specialists", "specialists": ["typescript"] },
    "remote": [{ "name": "infra", "url": "http://remote-host:4000/infra" }]
  }
  ```

  **After — `config.json`:**
  ```json
  {
    "specialists": [
      { "name": "typescript" },
      { "name": "infra", "url": "http://remote-host:4000/infra" }
    ]
  }
  ```

  **After — `gateway.json`** (server mode only):
  ```json
  { "port": 4000, "specialistsDir": ".consilium/specialists" }
  ```

- **Auto-discovery removed.** All specialists must be listed explicitly in `config.json`.

- **Local specialists no longer require a gateway.** Specialists with no URL are read directly by sub-agents — no `consilium start` needed for local use.

### New features

- **Separate `gateway.json`** for server/process config (`port`, `specialistsDir`, `auth`). The gateway can now be deployed standalone without a `config.json`.

- **Three specialist access modes:**
  - `{ "name": "..." }` — local, sub-agents read SKILL.md directly
  - `{ "name": "...", "url": "http://localhost/..." }` — gateway-served via MCP
  - `{ "name": "...", "url": "http://remote/..." }` — remote, registered in `settings.json`

- **Per-request gateway logging** — method, path, status, duration, session ID, lifecycle event (`new`/`existing`/`closed`). Logs go to stderr (foreground) and `.consilium/gateway.log` (always, truncated on start).

- **Security specialist bundled** — `consilium install` now creates both `typescript` and `security` specialists.

- **`/cs:plan` asks upfront** whether to pre-curate codebase context before reading any files, keeping main context clean when free exploration is chosen.

### Migration from 0.1.0

1. Replace `.consilium/config.json` with the new schema (see above).
2. If running a gateway, create `.consilium/gateway.json` with `port` and `specialistsDir`.
3. Remove `consilium start` from workflows that use only local specialists.

---

## 0.1.0 — initial release

- Gateway multiplexing specialists via StreamableHTTP
- `consilium install/start/stop/uninstall` CLI
- `/cs:plan`, `/cs:review`, `/cs:work`, `/cs:done` slash commands
- OAuth Bearer token validation (`auth.issuer` + `auth.audience`)
- TypeScript specialist bundled
