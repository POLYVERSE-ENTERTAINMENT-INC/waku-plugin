# Waku plugin

Create, adapt, publish and edit **mobile playable web content** on the [Waku](https://github.com/POLYVERSE-ENTERTAINMENT-INC) platform — directly from Claude Code (Codex support coming). Install once; you get the creation skills, the operations skill, the `waku` CLI, and the Waku multimodal MCP server, all wired up.

## What's inside

| Piece | What it does |
|---|---|
| **`waku` skill** | Knowledge for creating a new playable from scratch (intake → spec → React/Tailwind build → assets). |
| **`waku-adapt` skill** | Knowledge for adapting an **existing** local game: replace its AI calls with the platform runtime SDK, strip secrets, apply mobile constraints. |
| **`waku-cli` skill** | The publish lifecycle: login, publish to Feed, shareable preview, pull → edit → republish, unpublish, delete, plus the pre-publish conformance check. |
| **`waku` CLI** | The engine for every authenticated action. Not shipped in the plugin — the launcher installs it to `~/.waku` on first use. |
| **`waku` MCP** | Multimodal generation (image / music / sfx / speech / video) used during creation. Auto-registered via `.mcp.json`; reuses your login, mints tokens on demand. |
| **Slash commands** | `/waku:login`, `/waku:create`, `/waku:adapt`, `/waku:publish`, `/waku:edit`. |

## Install

> The product monorepo is private, so this plugin lives in its own repo and is installed as a marketplace.

**From GitHub** (once the repo is published):

```
/plugin marketplace add POLYVERSE-ENTERTAINMENT-INC/waku-plugin
/plugin install waku@waku
```

**From a local clone** (for testing):

```
/plugin marketplace add /absolute/path/to/waku-plugin
/plugin install waku@waku
```

On first session after install, a SessionStart hook installs the `waku` CLI to `~/.waku` (idempotent — skipped if already present) and, if you're not logged in, prints a one-line hint. Nothing is re-installed on later sessions, and you're never auto-prompted to log in when already authenticated.

## First run

```
/waku:login          # browser → Waku website OAuth (one time; session auto-renews)
/waku:create         # scaffold a fresh playable and build it
# or
/waku:adapt          # bring an existing local game onto the platform
/waku:publish        # build + publish to your Feed
/waku:edit           # pull a published playable, edit, re-publish
```

## How it fits together

- **Skills = knowledge** (bundled, static, updated via `/plugin update`).
- **CLI = actions** (login / publish / pull / republish / unpublish / delete) — one self-updating binary at `~/.waku`, reused by both the commands and the MCP server.
- **MCP = capability** (asset generation during creation) — `waku mcp serve`, zero token in config, reuses your login.
- One `~/.config/waku/auth.json` ties it all together: log in once.

## Maintenance

The creation skills are derived from the Waku monorepo's `managed-skills/`. To refresh them:

```
MONOREPO=/path/to/polyverse_samantha bash scripts/sync-from-monorepo.sh
```

(Then re-apply the plugin-local edits to `skills/waku/SKILL.md` — see the script's note.)
