---
description: Adapt an EXISTING local web game to run on the Waku platform (merge the session-template shell as needed, replace AI calls with the Waku runtime SDK, apply mobile constraints, strip secrets).
argument-hint: "[path to the existing game]"
---

The user already has a local game/app they want to put on Waku. Use the **waku-adapt** skill. Summary:

1. Ensure login (`waku whoami`; `/waku:login` if needed).
2. Work on a COPY of their project — don't mutate the original until verified. Create the adaptation workspace from the bundled Waku template first:
   ```bash
   waku template copy ./<adapt-dir>
   ```
   Then migrate the original game logic/assets into that template workspace. If the bundled template is unavailable, stop; do not hand-write a replacement shell.
3. Scan for runtime AI calls and secrets:
   ```bash
   rg -n "openai|wavespeed|replicate|apiKey|Authorization|Bearer|/generate|/chat|/v1/llm|127.0.0.1|localhost|fetch\(" .
   ```
4. Inject the platform runtime: add `vendor/polyverse-content-runtime.min.js` (from the template) + a `<script type="application/polyverse-manifest">` declaring exactly the capabilities used.
5. Collapse all AI calls behind a thin adapter using `window.Polyverse.ready()` → `pv.multimodal.generate`, and replace the direct provider calls. Where you can't safely auto-replace, leave `// TODO(waku-adapt)` and tell the user.
6. Fully adapt the playable, not merely wrap it:
   - Full-bleed canvas/world-only visuals may live in `.stage`.
   - Any readable or tappable existing UI, including an embedded legacy HTML game, must live inside `.safe-ui` / `.safe-center` with bounded dimensions.
   - Do not put a legacy full-page iframe inside `.stage`; that bypasses safe-area constraints and must fail review.
   - Prefer porting the game into React components. If an iframe bridge is used temporarily, the adapter must reserve Waku host chrome for the iframe and any nested readable/tappable UI; do not require the original game source to know Waku's rules.
7. If the original page exceeds one mobile safe viewport, split it into Waku states (`intro`/`menu` -> `playing` -> `result`). Put instructions/start/help/settings/results in safe-area screens, and keep the `playing` screen focused on the core loop. Do not use whole-page or iframe scaling as a shortcut.
8. Add `window.__WAKU_GAME__`, `window.__waku_debug`, preview state hooks, and the template contract test. Remove template-only visible debug/demo UI such as `RuntimeProbe`, `DeviceProbe`, `DefaultPlayable`, and `GestureHintShowcase`; these are not production UI.
9. Remove every provider key / direct endpoint / token from the artifact.
10. Build with `npm install && npm run test`, then run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
   node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
   ```
   Treat failures as blockers. Read the JSON reports for issue codes, element evidence, screenshot paths, and suggested fixes. Existing projects are publishable only after they satisfy the same template floor as Waku-created projects.
11. Never use `waku api` to upload the playable or flip preview/deployment/publication status. Uploading and publishing both must go through the launcher gates.
12. Before publishing, do a real mobile visual check at about `390x844`: record the bounds of `.safe-ui`, the game root, and any iframe/canvas. The playable content must fit inside `.safe-ui` unless it is non-readable full-bleed background/world art. The plugin visual gate simulates Waku top/bottom host chrome and fails nested iframe HUD/buttons/status cards that intersect it.
13. Publish via the **waku-cli** skill.

$ARGUMENTS
