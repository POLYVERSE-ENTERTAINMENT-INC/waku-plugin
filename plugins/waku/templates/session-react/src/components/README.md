# `src/components/`

Reserved for generated or imported component-library code.

Ships one standard primitive: `ui/GestureHint` — a white dot that loops a gesture
demo for first screens with no obvious button. Styles: `tap`, `long-press`, and
`swipe` (with a motion trail; `direction` = up/down/left/right/left-right).
`ui/GestureHintShowcase` renders all styles at once for local review only.
Pointer-transparent; the parent owns dismissal via the `visible` prop.

In this template, platform geometry and the neutral smoke demo do **not** live here. That keeps the folder clean for components pulled in by the agent through MCP, design-system registries, or future WAKU component sources.

Recommended use:

```txt
src/components/
  ui/                 # imported primitives, for example button/card/dialog
  generated/          # MCP or design-export generated components
  game/               # reusable visual pieces for the current playable
```

Rules:

- Do not put WAKU runtime calls here.
- Do not put secrets, raw MCP endpoints, or provider URLs here.
- Do not move `.bg-layer` or `.safe-ui` ownership into this folder.
- Components should receive data and callbacks from `src/playable/` or `src/App.tsx`.
