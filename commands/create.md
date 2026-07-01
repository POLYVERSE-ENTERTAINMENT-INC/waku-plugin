---
description: Start a NEW Waku playable from scratch (scaffold the platform template into a fresh folder, then build it).
argument-hint: "[project name] [what you want to make]"
---

The user wants to create a brand-new mobile playable on Waku. Use the **waku** creation skill, and follow this greenfield flow:

1. Ensure login: run `waku whoami`; if it fails, tell them to run `/waku:login` (don't nag if already logged in).
2. **Scaffold into a NEW subfolder — never touch the current directory's existing files.** Pick a short `<name>` (ask if not given), then:
   ```bash
   git clone --depth 1 https://github.com/polyverse-ai/polyverse-session-template-dev.git ./<name>
   rm -rf ./<name>/.git
   ```
   If `./<name>` already exists and is non-empty, stop and ask for a different name. (If the clone fails because the template repo isn't accessible, tell the user — don't fabricate a project.)
3. `cd ./<name>` and do all work there. Follow the **waku** skill: intake (ask the user creative questions first), spec, build with React+Tailwind, generate production assets via the Waku MCP tools. Do not replace the scaffold with a plain Vite app; preserve the current template shell (`.bg-layer`, `.stage`, `.safe-ui`, `.safe-center`), Polyverse manifest/runtime, probes, and `npm run test`.
4. Before first publish, run `waku ls` or `waku api GET /projects` and check whether `<name>` already exists for this user. `waku publish --name "<name>"` updates an existing same-name project, so do not publish with a duplicate name unless the user explicitly asked to update/replace that project; choose a unique name or ask first.
5. Deliver via the **waku-cli** skill only after the template floor passes: `npm install && npm run test`, same-name check, then `waku publish --name "<name>" --site-dir public`.

$ARGUMENTS
