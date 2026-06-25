# React + Tailwind Implementation Contract

## Source of truth

Implementation rules live in skills. The template repo should stay an executable scaffold with a short README, source code, static checks, and assets. Do not add duplicate `docs/TEMPLATE_CONTRACT.md` files to generated products; use the sibling skill reference plus machine checks as the contract.


The template is a static React app. React owns composition; Tailwind owns UI ergonomics; CSS variables own platform geometry.

## Directory responsibilities

| Path | Responsibility |
|---|---|
| `src/main.tsx` | React entry; `createRoot` mounts the app into `#root` |
| `src/App.tsx` | template-owned shell: `.bg-layer`, `.zone-c-safe`, `#playfield`, i18n boot |
| `src/components/` | generated or MCP/design-system imported component-library code; empty by default except README |
| `src/playable/` | content/game state machine, scoring/progress, timers, loop, result, replay, demo UI, probe surface |
| `src/waku/` | WAKU / Polyverse content runtime package JS adapters and platform calls |
| `src/lib/` | i18n, audio, gesture lock, pure browser helpers |
| `src/index.css` | Tailwind import, tokens, safe-area geometry, required selectors, demo styles |
| `static/` | public runtime vendor, locale JSON, durable local/static assets |

## Preserve from template

- `index.html` loads content-runtime bundle before app code.
- Manifest uses top-level `runtime` and live `capabilities` array.
- Capability reference is marked `data-reference-only="true"`.
- `base: "./"` in Vite config.
- Locale fetches resolve through `document.baseURI`.
- `.bg-layer` is full-bleed and hard-coded in `src/App.tsx`.
- `.zone-c-safe` is hard-coded in `src/App.tsx` and contains player-critical UI only.
- `src/components/` remains available for generated/imported UI; the base scaffold does not import its own shell from there.
- Gesture lock disables context menu, multi-touch pinch, drag, and selection except opted-in controls.
- BGM is singleton and starts after user interaction.
- SFX duration is bounded.
- Probe surface stays exposed.

## Component import rule

Use `src/components/` for visual code pulled in by MCP, design tooling, registries, or future WAKU component sources.

Good:

```txt
src/components/ui/Button.tsx
src/components/generated/PrizeCard.tsx
src/components/game/DiceFace.tsx
```

Avoid:

```txt
src/components/SafeFrame.tsx
src/components/BackgroundLayer.tsx
src/components/WakuRuntimeClient.ts
```

Template shell belongs in `src/App.tsx`; behavior orchestration belongs in `src/playable/`; platform runtime calls belong in `src/waku/`.

## Safe-area implementation

Keep geometry as named CSS variables:

```css
--runtime-safe-top
--runtime-safe-bottom
--waku-top-chrome
--waku-bottom-chrome
--zone-c-top
--zone-c-bottom
```

Use `.zone-c-safe` for:

- CTA
- HUD
- readable text
- input controls
- result card body
- critical feedback

Use full-bleed layer for:

- background/world/canvas
- scene/camera/media
- particles
- full-screen scrim/dim/vignette/transition
- modal backdrop

Do not render safe-area borders, labels, debug rulers, or fake phone shells in production.

## State and React rules

- Model legal phases explicitly: `ready`, `playing`, `result`, plus domain-specific states as needed.
- Core input handlers must update state synchronously enough for smoke to observe `data-phase` leaving `ready` within 500ms.
- Keep state snapshots serializable.
- Keep result payload stable enough for `getResult()`.
- Use refs for mutable timing/audio handles; use React state for review-visible state.
- Avoid hiding failed SDK calls under permanent loading overlays.

## Tailwind rules

- Use utilities for layout, spacing, typography, and responsive UI.
- Keep token values in CSS variables where Review or platform needs stable names.
- Use `@layer components` for required selectors and platform geometry.
- Respect `prefers-reduced-motion` for decorative motion.
- Do not scatter safe-area math through JSX arbitrary classes.

## Build and test

Run the template floor before claiming complete:

```sh
npm run test
```

This checks TypeScript, manifest/runtime contract, build, and relative built paths.
