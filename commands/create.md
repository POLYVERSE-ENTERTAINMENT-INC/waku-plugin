---
description: Start a NEW Waku playable from scratch (scaffold the platform template into a fresh folder, then build it).
argument-hint: "[project name] [what you want to make]"
---

The user wants to create a brand-new mobile playable on Waku. Use the **waku** creation skill, and follow this greenfield flow:

1. Ensure login: run `waku whoami`; if it fails, tell them to run `/waku:login` (don't nag if already logged in).
2. **Scaffold into a NEW subfolder — never touch the current directory's existing files.** Pick a short `<name>` (ask if not given), then:
   ```bash
   waku template copy ./<name>
   ```
   If `./<name>` already exists and is non-empty, stop and ask for a different name. If the bundled template is unavailable or the copy command reports `BLOCKED_TEMPLATE_UNAVAILABLE`, stop and report that blocker — don't fabricate a project shell.
3. `cd ./<name>` and do all work there. Follow the **waku** skill: intake (ask the user creative questions first), spec, build with React+Tailwind, generate production assets via the Waku MCP tools. Do not replace the scaffold with a plain Vite app; preserve the current template shell (`.bg-layer`, `.stage`, `.safe-ui`, `.safe-center`), Polyverse manifest/runtime, probes, and `npm run test`.
4. Do not crowd instructions, start controls, HUD, gameplay, and results into one screen. Use explicit phases (`intro`/`menu`, `playing`, `result`) whenever copy or controls would compete with the core loop. Keep readable/tappable UI in `.safe-ui`; canvas/stage is for world visuals only.
5. After implementation, run the mandatory create gate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-create-gate.mjs" --project-dir . --site-dir public --screenshot waku-visual-check.png --visual-report waku-visual-report.json
   ```
   This runs `npm run test` and the mobile visual host-chrome gate. If it fails, inspect the terminal output, `waku-visual-report.json`, and `waku-visual-check.png`, fix the project, and rerun the same command. Repeat until it passes. Do not show the user a final result, start a server for review, upload, or publish while this gate is failing. If three repair passes still fail, stop and report the blocker with the report and screenshot paths.
6. Before first publish, run `waku ls` or `waku api GET /projects` and check whether `<name>` already exists for this user. `waku publish --name "<name>"` updates an existing same-name project, so do not publish with a duplicate name unless the user explicitly asked to update/replace that project; choose a unique name or ask first.
7. Deliver via the **waku-cli** skill only after the create gate passes and same-name check is complete: `waku publish --name "<name>" --site-dir public`.

$ARGUMENTS
