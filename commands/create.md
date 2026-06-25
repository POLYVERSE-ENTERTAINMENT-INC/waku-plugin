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
3. `cd ./<name>` and do all work there. Follow the **waku** skill: intake (ask the user creative questions first), spec, build with React+Tailwind, generate production assets via the Waku MCP tools.
4. Deliver via the **waku-cli** skill: `npm install && npm run build`, then `waku publish --name "<name>" --site-dir public`.

$ARGUMENTS
