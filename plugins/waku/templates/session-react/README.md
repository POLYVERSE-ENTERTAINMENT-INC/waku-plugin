# Polyverse Session Template

WAKU playable runtime shell. This is a **React + Tailwind CSS + Vite** template that keeps the original WAKU runtime contract while leaving `src/components/` empty for future generated/imported component-library code.

It ships a neutral three-tap smoke demo: tap the number to `3`, reach a result panel, replay, and expose enough probe data for automated review.

## Stack

```txt
React 19 + TypeScript + Tailwind CSS 4 + Vite
```

Vite is only the local dev/build tool. The shipped artifact is still static HTML/CSS/JS under `public/`; the WAKU WebView does not run Vite.

The template intentionally avoids private package dependencies in the base scaffold. Platform capabilities still go through the shipped content-runtime browser bundle and `window.Polyverse.ready()` when a generated playable actually needs them.

## Source layout

| Path | Role |
|---|---|
| `index.html` | Platform manifest, capability reference, React root, runtime/script load order |
| `src/main.tsx` | React entry |
| `src/App.tsx` | Template-owned shell: hard-coded `.bg-layer`, `.zone-c-safe`, playfield mount, i18n boot |
| `src/components/` | Reserved seam for MCP/design-system/generated component-library code; template does not import from here by default |
| `src/playable/` | Content loop and default smoke demo: state machine, result/replay UI, QA probe surface |
| `src/waku/polyverse.ts` | Typed seam for WAKU / Polyverse content runtime package JS calls |
| `src/lib/i18n.ts` | `zh`/`en` auto-detect, locale JSON fetch via `document.baseURI` |
| `src/lib/audio.ts` | Web Audio BGM/SFX; BGM singleton, SFX duration-bound |
| `src/lib/gestures.ts` | Mobile WebView gesture lock with input escape hatches |
| `src/index.css` | Tailwind import, theme tokens, safe-area geometry, structural selectors, demo styles |
| `static/vendor/polyverse-content-runtime.min.js` | Content runtime bundle loaded before app code |
| `static/locales/*.json` | Key-based visible copy |
| `scripts/runtime-contract-check.js` | Static contract check for manifest, runtime, React/Tailwind deps, secrets, safe-area selectors |
| `scripts/check-built-paths.js` | Post-build relative-path guard for sub-path hosting |

## Commands

```sh
npm install
npm run dev
npm run build      # Vite build -> public/
npm run test       # typecheck + runtime contract + build + path guard
```

## Preserved runtime contract

The authoritative contract lives in the sibling `skills/` folder, especially `../skills/polyverse-content-runtime/reference/react-tailwind-template.md`. The template repo keeps only executable scaffold plus a short README so generated products do not accumulate duplicate rule books or embedded skill copies. The important invariants are:

- mobile portrait first
- full-bleed `.bg-layer` is hard-coded in `src/App.tsx`
- player-critical `.zone-c-safe` is hard-coded in `src/App.tsx`, inset from WAKU chrome + device safe area
- `src/components/` is available for agent/MCP imported UI, not for the template shell
- no page scroll, no long-press/context/pinch defaults outside opted-in inputs
- first interaction gate: no score/result/BGM/timer/AI job before the first user action
- neutral smoke loop: `ready -> playing -> result -> replay`
- `zh/en` locale loading with unknown-language fallback to English
- content runtime bundle loaded before app code
- live manifest stays `capabilities: []` until code actually calls a platform API
- `window.__WAKU_GAME__` and `window.__WAKU_TEMPLATE_DEBUG__` expose runtime probes
- `.zone-c-safe` mirrors `data-phase`, `data-score`, `data-target`, `data-events`, feedback, BGM, result, and timing fields
- `pv.preview.registerStates` declares ready / playing / result preview states, each reachable from hard-coded mock data (host renders the preview state strip and drives `preview.state.goto` / `preview.freeze`)

## Platform capabilities

Use the capability reference in `index.html` as the menu, then update the live manifest only for capabilities actually called by code.

Minimal runtime shape:

```ts
import { readyWakuRuntime } from "./waku/polyverse";

const pv = await readyWakuRuntime();
await pv.app?.haptics?.play({ style: "light" });
```

AI job-backed calls must also declare `multimodal.jobs.read` if the code waits or polls.

## Share-to-comments contract

The only share channel is `app.comment.compose` (it posts to the comment area). Share **this player's real result**, never a bundled decorative asset.

- **Default is text-only.** `composeWakuComment(text)` posts the player's actual result line with no image. Always works, declares only `app.comment.compose`. This is the recommended default.
- **Image is an opt-in per-player card.** To post a picture, render *this run* to a card (`renderResultCard` in `src/lib/sharecard.ts`) → upload it for a public URL (`uploadImageForShare`) → `composeWakuComment(text, url)`. The composer's host classifier accepts an image only for a fetchable `http(s)` URL, so a rendered card must be uploaded; a `data:` URL or a bundled `.webp` is wrong. The upload needs `player-storage.write` in the manifest. The demo wires this live behind `SHARE_WITH_CARD` in `DefaultPlayable.tsx` — flip it on, fill the card with your data.
- **Never** point the share at `bg-texture.webp` or any packaged art as if it were the result. If you can't produce a real per-player image, share text.

## Safe-area rule

Two layers, two jobs:

1. `.bg-layer` is the world/media layer. It fills the viewport and may cross top/bottom chrome.
2. `.zone-c-safe` is only for readable/tappable player-critical UI. Do not place the whole world, canvas, or full-screen scrim inside it just to pass checks.

These two layers are template-owned structural code in `src/App.tsx` plus audited CSS in `src/index.css`. Generated games can replace the visual content inside the playfield, but should not delete or relocate these selectors.

The safe area is structural. The final runtime must not render debug borders, zone labels, or QA overlays.

## Pre-ship checklist

- [ ] Replace the neutral three-tap loop with the actual game/content loop.
- [ ] Keep first action cheap, visible, and touch-complete.
- [ ] Keep all visible copy in `static/locales/en.json` and `static/locales/zh.json`.
- [ ] Keep runtime images/audio durable; no provider temp URLs, no secrets, no raw MCP endpoints.
- [ ] Keep WAKU package JS calls inside `src/waku/` wrappers.
- [ ] Keep imported/generated UI in `src/components/` and keep behavior in `src/playable/`.
- [ ] Keep `window.__WAKU_GAME__` and safe-layer `data-*` probes exposed.
- [ ] Keep `registerWakuPreviewStates` declaring entry / core-loop / result states with mock-reachable `apply()`.
- [ ] Run `npm run test` before packaging.
