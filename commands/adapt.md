---
description: Adapt an EXISTING local web game to run on the Waku platform (merge the session-template shell as needed, replace AI calls with the Waku runtime SDK, apply mobile constraints, strip secrets).
argument-hint: "[path to the existing game]"
---

The user already has a local game/app they want to put on Waku. Use the **waku-adapt** skill. Summary:

1. Ensure login (`waku whoami`; `/waku:login` if needed).
2. Work on a COPY of their project — don't mutate the original until verified.
3. Scan for runtime AI calls and secrets:
   ```bash
   rg -n "openai|wavespeed|replicate|apiKey|Authorization|Bearer|/generate|/chat|/v1/llm|127.0.0.1|localhost|fetch\(" .
   ```
4. Inject the platform runtime: add `vendor/polyverse-content-runtime.min.js` (from the template) + a `<script type="application/polyverse-manifest">` declaring exactly the capabilities used.
5. Collapse all AI calls behind a thin adapter using `window.Polyverse.ready()` → `pv.multimodal.generate`, and replace the direct provider calls. Where you can't safely auto-replace, leave `// TODO(waku-adapt)` and tell the user.
6. Merge the current session-template shell when the source project is a plain web game: keep `.bg-layer` / `.stage` for full-bleed world content, `.safe-ui` / `.safe-center` for HUD/buttons/text/results, plus `window.__WAKU_GAME__`, `window.__waku_debug`, and the template contract test.
7. Remove every provider key / direct endpoint / token from the artifact.
8. Verify against the conformance checklist, then publish via the **waku-cli** skill.

$ARGUMENTS
