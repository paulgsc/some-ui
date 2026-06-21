# sandlot

## What this is

`sandlot` is a **hypothetical NVDA options position illustrator** built for livestream presentation. It is not a brokerage, not a trading tool, not financial advice. Its singular job is to let an options trader describe a position — a tuple of legs, each being an (option type, side, strike, expiry, quantity, premium, IV) — and immediately render the P/L surface, net Greeks, and thesis narrative, all driven by a simulated spot price and user-controlled DTE/IV sliders.

The word "sandlot" is deliberate: everything here is hypothetical. Positions are synthetic. No real account data ever enters this system. This is a **presentation instrument**, not a portfolio manager.

The trader it serves focuses exclusively on NVDA, using options structures (verticals, strangles, condors, butterflies) to express views on volatility, time decay, and range-bound price behavior. The tooling should reflect that specificity — it is not a general options calculator.

## Why this exists (the thesis, stable across all iterations)

Discussing live options positions on a public stream creates two problems simultaneously:

1. **Security surface**: showing a real brokerage UI exposes account identifiers, position sizes, cost basis, and historical trades — all of which enable social engineering and doxing.
2. **Cognitive load**: operating a real brokerage UI while reasoning aloud about Greeks, spread structure, and thesis narrative requires context switching that degrades the quality of both the trading thought and the explanation.

`sandlot` dissolves both problems by making the financial data structurally fictional. The positions entered here are _illustrative counterparts_ to real positions — same structure, same logic, same Greeks — but carry zero identity information and require zero account access. The presenter can think in spreads, not in UI widgets.

The secondary thesis is **ergonomic presentation over analytical depth**. The full `portfolio-cognition-engine` spec (see `content/hallucinations/portfolio-cognition-engine.mdx`) is the long-horizon analytical system. `sandlot` is deliberately narrower: it serves the single act of _explaining a position on stream_ with minimal friction.

## Current architecture (what exists now)

This is a **library package** inside a pnpm monorepo (`packages/ui/sandlot` or `apps/sandlot`, depending on placement). It exports pure presentational React components and pure TypeScript pricing functions. It has no server dependency, no authentication, no persistence.

### Source layout

```
src/
  types/index.ts          — all domain types: Leg, SimState, Greeks, PLMetrics,
                            SpreadArchetype, MotifPoint, SandlotPosition
  lib/
    blackScholes.ts       — pure BS pricing, Greeks, P/L curve construction,
                            metrics derivation. Zero React, fully unit-testable.
    archetypeDetector.ts  — constraint-satisfaction spread classifier returning
                            SpreadArchetype from a Leg[]. Pure function.
  components/
    pl-chart/             — SVG P/L surface chart. Props: curve, spot, breakevens.
    leg-list/             — leg display list + LegRow. Props: legs, legPLs, callbacks.
    add-leg-form/         — controlled leg entry form. Props: onAdd, onCancel, defaults.
    sim-controls/         — spot/DTE/IV sliders. Props: sim state + change callbacks.
    metrics-bar/          — P/L and Greeks summary bar. Props: metrics, greeks.
    top-bar/              — ticker, spot readout, archetype badge, position name.
    motif-panel/          — checklist of thesis talking points. Props: points + callbacks.
    sandlot-app/          — full composition story only; no index.tsx here —
                            the wiring lives in consumer space or in stories.
  index.ts                — public surface: re-exports components + types + lib
  sandlot.css             — sideEffect CSS (range sliders, scrollbars)
```

### Invariants a model must respect

**1. Components are pure presentational.** No component in `src/components/` may import from a store, a query client, an HTTP client, or any vendor-coupled module. Every component is a function from props to JSX. State is lifted to the consumer (story, page, app shell).

**2. The library has no runtime dependencies.** `peerDependencies` are React only. No Zustand, no TanStack Query, no Axios lives inside this package. Any state management is the consumer's concern.

**3. `src/lib/` is framework-free.** The pricing and detection functions are plain TypeScript. They can be called from a Web Worker, a server route, or a test harness without any React in scope.

**4. Storybook is the design interface.** Every component has a co-located `index.stories.tsx`. The story file is where controlled-state wrappers live. The full composition (`sandlot-app/index.stories.tsx`) wires everything using only `useState` and lib calls — it is the reference implementation of how a consumer should drive the package.

**5. `tsconfig.build.json` strips stories from emit.** Stories are never part of the published dist.

**6. All positions are hypothetical.** No component, type, or function should ever handle real account data, real authentication tokens, or real brokerage API responses. If a future addition requires network I/O, it must enter through a well-typed protocol boundary (see roadmap), not by modifying existing components.

## What is changing (the updated user story)

The original user story assumed the presenter would _manually build_ a position via the leg form. This created its own cognitive overhead: while trying to reason about a spread, the presenter also has to operate a form UI.

The updated user story introduces a **chatbot portal** as an alternative input surface. Instead of clicking through the leg form, the presenter types (or speaks) a natural-language description of a position, and a model translates that into the `Leg[]` schema that the existing components already consume.

Example: `"short the 130 call and buy the 140 call, both Jan 17, for a net credit of about $1.25"` → produces the correct two `Leg` objects, which then flow into the existing `LegList`, `PLChart`, `MetricsBar`, etc. without modification.

This means three new concerns are entering the system:

1. **Chatbot portal UI** — a new component subtree, same design language, same Storybook idiom.
2. **Spreads protocol** — a typed schema + prompt contract that defines what a model must produce given natural-language input. This is the translation layer between language and `Leg[]`.
3. **I/O typestate** — the FSM for the network round-trip: idle → pending → success/error, with ergonomic UI feedback at each state. Not happy-path only.

None of these concerns modifies the existing component tree. They compose on top of it.

## What a model should not do when working in this codebase

- **Do not add store imports to components.** If a component needs dynamic data, add a prop.
- **Do not add runtime deps to `package.json`.** Check `peerDependencies` first.
- **Do not create a `main.tsx` or `index.html` here.** This is a library package.
- **Do not conflate the chatbot portal with the existing manual UI.** They are two input surfaces that share the same output types (`Leg[]`, `MotifPoint[]`). Keep them structurally separate.
- **Do not hardcode tickers.** NVDA is the domain focus, but strike/expiry values are always passed as props or derived from the position state. The underlying pricing math is ticker-agnostic.
- **Do not add tax logic.** The full spec (`portfolio-cognition-engine`) includes a tax engine. That is out of scope for `sandlot`.
- **Do not remove the `hypothetical` badge from the TopBar.** It is not cosmetic — it is a deliberate design assertion that this data is not real.

## How to read the source if you only have a subset of files

If you are given a component file without its story, infer the props contract from the component's exported type (`TopBarProps`, `PLChartProps`, etc.) — they are always co-located and explicit.

If you are given a story file without the component, the story `args` and the `render` function together fully describe the component's interface — treat them as a spec.

If you are given `src/lib/blackScholes.ts` and nothing else, know that every function there is a pure transform from `(Leg[], spot, dte, ivShift)` to a computed value. No side effects.

If you are given `src/types/index.ts`, that file is the ground truth for all domain types. Nothing in the system contradicts it.
