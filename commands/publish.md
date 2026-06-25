---
description: Build and publish the current Waku project to your Feed.
---

Follow the **waku-cli** skill to publish the playable in the current directory.

1. `waku whoami` (if it fails, `/waku:login`).
2. Run the platform conformance self-check first (the `rg` red-line scan in the waku-cli skill) — the artifact must contain no provider keys, direct AI endpoints, or tokens.
3. `npm install && npm run build` (produces `public/`).
4. From a pulled project dir (has `.waku/project.json`): just `waku publish` (republishes the same project). Otherwise: `waku publish --name "<name>" --site-dir public`.
5. Report `content_id` / `preview_url` back to the user.

$ARGUMENTS
