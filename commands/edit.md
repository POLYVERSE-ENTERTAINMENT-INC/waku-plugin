---
description: Pull one of your published Waku playables, edit it locally, and re-publish.
argument-hint: "[project name or id]"
---

Follow the **waku-cli** skill for the round-trip edit flow.

1. `waku ls` to find the project.
2. `waku pull "<name-or-id>"` — downloads its source into a new subfolder and writes `.waku/project.json`.
3. `cd` into that folder, edit `src/`, then `npm install && npm run test` when the project has the session-template test script; otherwise run the strongest available local checks before `npm run build`.
4. `waku publish` (inside the pulled dir) republishes the same project: new version, the Feed position stays put, the old version is retained for rollback.

$ARGUMENTS
