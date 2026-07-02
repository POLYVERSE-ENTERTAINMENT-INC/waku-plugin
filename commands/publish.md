---
description: Build and publish the current Waku project to your Feed.
---

Follow the **waku-cli** skill to publish the playable in the current directory.

1. `waku whoami` (if it fails, `/waku:login`).
2. Run the platform conformance self-check first (the `rg` red-line scan in the waku-cli skill) — the artifact must contain no provider keys, direct AI endpoints, or tokens.
3. `npm install && npm run test` when the project has the session-template test script; otherwise stop and route the project through `/waku:adapt` first. Do not publish a plain Vite/HTML project as a Waku playable.
4. Run the plugin gate before any `waku publish` or `waku playground upload`:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
   ```
   In Codex/local checkouts, use the absolute plugin script path if `CLAUDE_PLUGIN_ROOT` is not set. If this fails, read the JSON reports for issue codes, evidence, and fixes, then adapt the project into the session template contract instead of bypassing the gate. The `waku` launcher runs both checks automatically before publish/upload.
5. Do not use `waku api` to upload a playable, mutate deployment/publication status, or convert `preview_ready` to `published`; those API writes bypass the upload/publish gates and the plugin launcher rejects them.
6. From a pulled project dir (has `.waku/project.json`): just `waku publish` (republishes the same project).
7. Otherwise this is a new-project publish: run `waku ls` first and check the requested name/slug. `waku publish --name "<name>"` updates an existing same-name project for the same user; it does not create a second one. If the name exists, choose a unique name or ask for explicit overwrite permission before publishing.
8. Report `content_id` / `preview_url` back to the user.

$ARGUMENTS
