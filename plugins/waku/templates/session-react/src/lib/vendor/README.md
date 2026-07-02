# src/lib/vendor — pre-installed runtime skeleton

These are the high-frequency reusable runtime components, **already in the project**.
Import them directly — do **not** re-implement them, and do **not** copy their code into
`src/lib/` or `src/engine/`. Unused files are tree-shaken out of the build, so importing
only what you need costs nothing. The contract check (`npm test`) flags hand-rolled
re-implementations of these.

```ts
import { createFixedStepLoop } from "./lib/vendor/fixed-step-game-loop";
import { createResponsiveCanvas } from "./lib/vendor/responsive-canvas-stage";
```

| file | use it for | key exports |
|---|---|---|
| `fixed-step-game-loop` | deterministic fixed-step update + rAF render loop | `createFixedStepLoop` |
| `responsive-canvas-stage` | canvas sized to its box × dpr, ResizeObserver, css/device coord map | `createResponsiveCanvas` |
| `juice-fx-layer` | screen shake / float text / particle burst / slow-mo / hit-flash (declarative; correct fx-host that won't collapse) | `createJuiceFxLayer`, presets |
| `media-element-audio` | BGM + SFX with WebAudio synth fallback when EL quota/CORS fails (GCS-safe, never silent) | `createAudioManager`, `playBgm` |
| `score-combo-tracker` | score / combo / streak thresholds / local best | `createScoreComboTracker` |
| `seeded-random-utils` | deterministic RNG: `mulberry32`, `hashString`, `randInt`, `pick`, `shuffle`, `pickN` | (functions) |
| `seeded-verdict-bank` | bilingual verdict/result-copy bank with slot-fill, seeded variant pick | `pickVariant`, `variantsFor`, `seedRng` |
| `result-card-canvas-toolkit` | result/share-card render helpers: `fitFont`, `wrapLines`, `drawSeal`, `toDataUrlWithFallback` | (functions) |
| `archetype-typing-kit` | multi-axis vector → archetype/persona/ending classification | `nearestPrototype`, `signOrthant` |

Source of truth lives in the asset library (`waku-components/runtime/<slug>`); these are
byte-identical vendored copies. Need something not here (economy/resource manager,
turn-phase state machine, pointer-gesture adapter, weighted pools, grid engines, llm
structured fallback, vision loaders, UI skins, …)? Fetch it with `asset_get("<slug>")` —
see `references/runtime-components.md` — then drop it in this folder and import it the same way.
