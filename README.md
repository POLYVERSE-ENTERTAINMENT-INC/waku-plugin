# Waku plugin

Create, adapt, publish and edit **mobile playable web content** on the [Waku](https://github.com/POLYVERSE-ENTERTAINMENT-INC) platform — directly from **Claude Code and Codex**. Install once; you get the creation skills, the operations skill, the `waku` CLI, and the Waku multimodal MCP server, all wired up.

## What's inside

| Piece | What it does |
|---|---|
| **`waku` skill** | Knowledge for creating a new playable from scratch (intake → spec → React/Tailwind build → assets). |
| **`waku-adapt` skill** | Knowledge for adapting an **existing** local game: merge the session-template contract, replace AI calls with the platform runtime SDK, strip secrets, apply mobile constraints. |
| **`waku-cli` skill** | The publish lifecycle: login, publish to Feed, shareable preview, pull → edit → republish, unpublish, delete, plus the mandatory pre-publish conformance gate. |
| **`waku` CLI** | The engine for every authenticated action. Not shipped in the plugin — the launcher installs it to `~/.waku` on first use. |
| **`waku` MCP** | Multimodal generation (image / music / sfx / speech / video) used during creation. Auto-registered via `.mcp.json`; reuses your login, mints tokens on demand. |
| **Slash commands** | `/waku:login`, `/waku:create`, `/waku:adapt`, `/waku:publish`, `/waku:edit`. |

## Install

One repo serves both hosts. The `waku` CLI is **not** shipped inside the plugin — a launcher / SessionStart hook installs it to `~/.waku` on first use (idempotent; skipped if already present). You log in once; the session auto-renews and you're never re-prompted while authenticated.

### Claude Code

```
/plugin marketplace add POLYVERSE-ENTERTAINMENT-INC/waku-plugin
/plugin install waku@waku
```

Then start a new session. (Local testing: `/plugin marketplace add /absolute/path/to/waku-plugin`.)

### Codex

```
codex plugin marketplace add POLYVERSE-ENTERTAINMENT-INC/waku-plugin
```

Then enable the plugin: run `codex`, open `/plugins`, select **waku → Enable**
(or add to `~/.codex/config.toml`):

```toml
[plugins."waku@waku"]
enabled = true
```

Start a new `codex` session and the `waku` skills + MCP load automatically.

## First run

```
/waku:login          # browser → Waku website OAuth (one time; session auto-renews)
/waku:create         # scaffold a fresh playable and build it
# or
/waku:adapt          # bring an existing local game onto the platform
/waku:publish        # build + publish to your Feed
/waku:edit           # pull a published playable, edit, re-publish
```

## Try the full flow (acceptance)

End-to-end, on either host:

1. **Install** (above), then start a fresh session.
2. `/waku:login` → browser → log in on the Waku website (one time).
3. `/waku:create` → describe a small mobile playable; the agent scaffolds the platform template into a new folder, builds it, and generates any assets via the Waku MCP.
4. The create flow must pass the local create gate before handoff. The agent repeats code fixes until this passes:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-create-gate.mjs" --project-dir . --site-dir public --screenshot waku-visual-check.png --visual-report waku-visual-report.json
   ```
5. `/waku:publish` → builds, runs the conformance gate, and publishes to your Waku Feed. You get back a `content_id` + `preview_url`.
6. `/waku:edit` → pull it back, tweak `src/`, republish (same project, new version).
7. `/waku:unpublish` / delete to clean up.

Existing local games must pass the same floor before upload. The plugin launcher now runs conformance and mobile visual host-chrome gates automatically before `waku publish` and `waku playground upload`, and you can run them manually:

```
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
```

If this fails, route through `/waku:adapt`; do not publish a plain Vite/HTML project as a Waku playable. Gate failures write structured reports with issue codes, element evidence, suggested fixes, and screenshot paths so agents and users can see exactly what blocked the release.

Do not use `waku api` to upload a playable, mutate deployment/publication status, or convert `preview_ready` to `published`. Those writes bypass upload/publish gates, so the launcher refuses suspicious direct API mutations; use `waku playground upload` or `waku publish`.

The visual gate simulates Waku native top/bottom chrome and inspects same-origin iframe contents for readable/tappable UI such as HUD, score cards, buttons, hints, and result panels. For mobile visual evidence only, run:

```
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
```

For plugin regression fixtures:

```
node scripts/waku-conformance-fixtures.mjs
```

**Expected result:** the playable lands on the platform — the project shows `published`, and `preview_url` serves the game (HTTP 200). On Codex, the same `waku` skills + multimodal MCP tools (`polyverse_*`) are available; publishing goes through the same `waku` CLI and backend.

## How it fits together

- **Skills = knowledge** (bundled, static, updated via `/plugin update`).
- **CLI = actions** (login / publish / pull / republish / unpublish / delete) — one self-updating binary at `~/.waku`, reused by both the commands and the MCP server.
- **Launcher = plugin guard** — `bin/waku` wraps the real CLI and blocks publish/upload when the local conformance or mobile visual host-chrome gate fails. It also refuses direct `waku api` mutations that look like playable uploads or publication/deployment status changes. On first publish, it checks same-name projects and refuses accidental updates unless `WAKU_ALLOW_SAME_NAME_UPDATE=1` is set intentionally.
- **MCP = capability** (asset generation during creation) — `waku mcp serve`, zero token in config, reuses your login.
- One `~/.config/waku/auth.json` ties it all together: log in once.

## Maintenance

The creation skills are derived from the Waku monorepo's `managed-skills/`. To refresh them:

```
MONOREPO=/path/to/polyverse_samantha bash scripts/sync-from-monorepo.sh
```

(Then re-apply the plugin-local edits to `skills/waku/SKILL.md` — see the script's note.)
