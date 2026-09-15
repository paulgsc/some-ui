# Architecture — `@some-extension/conveyor` (some-conveyor)

**Artifact:** Firefox/Chrome browser extension — WASM-driven polyhedron content conveyor.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Injects a continuously scrolling strip of rotating cubes into the bottom of every page. Each cube is an independent projection surface driven by a Rust/WASM state machine. Acts as an always-on, ambient attention surface for scheduled content — treating browser attention as a schedulable resource without requiring a dedicated tab.

This workspace is the **reference implementation** of the Good-Citizen Charter's coexistence primitives (§5–§8): `ShadowHost`, `PageMonitor`/`AttentionMode`, `DisposableRegistry`, and the z-index policy originated here before being hoisted into `@some-extension/common`.

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Content script | `src/content/` | Mounts the conveyor strip; hosts the WASM bridge |
| Background | `src/background/` | Scheduling and content queue management |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **WASM bridge** | `src/lib/content/wasm-bridge.ts` — TypeScript ↔ Rust boundary. The Rust state machine drives cube geometry and rotation scheduling. |
| **Cube geometry** | `src/lib/content/cube-geometry.ts` — vertex/face calculations for the rotating polyhedra. |
| **Cube renderer** | `src/lib/content/cube-renderer.ts` — DOM/canvas rendering of individual cubes. |
| **Conveyor engine** | `src/lib/content/conveyor-engine.ts` — orchestrates the strip: positioning, scrolling velocity, cube lifecycle. |
| **Effect bus** | `src/lib/content/effect-bus.ts` — decoupled event bus for triggering visual effects on cubes. |
| **Coexistence runtime** | `src/lib/content/coexistence.ts` — the original `CoexistenceRuntime` implementation; source for the commons extraction. |
| **ShadowHost** | `src/lib/content/shadow-host.ts` — isolated shadow DOM mount point with z-index `2147483640`. |
| **PageMonitor** | `src/lib/content/page-monitor.ts` — fullscreen/visibility/focus → `Active`/`Reduced`/`Suspended` attention modes. |
| **DisposableRegistry** | `src/lib/content/disposable-registry.ts` — deterministic teardown of all content script resources. |
| **Theme engine** | `src/lib/content/theme-engine.ts` — integrates with `some-filter`'s theme system for consistent cube styling. |
| **Cycle rotation adapter** | `src/lib/content/cycle-rotation-adapter.ts` — maps scheduling events to cube rotation sequences. |

---

## Module map

```
src/
  background/                 — content queue + scheduling
  components/                 — overlay React/Preact components
  content/                    — content script entry
  lib/
    content/
      wasm-bridge.ts          — Rust/WASM boundary
      cube-geometry.ts        — polyhedron geometry
      cube-instance.ts        — per-cube state
      cube-renderer.ts        — DOM/canvas rendering
      conveyor-engine.ts      — strip orchestration
      effect-bus.ts           — decoupled visual effects
      coexistence.ts          — CoexistenceRuntime (reference impl for commons)
      shadow-host.ts          — shadow DOM isolation
      page-monitor.ts         — attention mode detection
      disposable-registry.ts  — teardown registry
      theme-engine.ts         — some-filter theme integration
      face-contents.ts        — cube face content model
      cycle-rotation-adapter.ts — scheduling → rotation mapping
      streak-store.ts         — streak data integration
    platform/                 — browser API shims
  styles/                     — conveyor CSS
README.md
amo-notes.md                  — wasm-unsafe-eval CSP justification
```

---

## Critical invariants

| # | Invariant |
|---|---|
| V1 | The conveyor strip is shadow-DOM isolated — it cannot be styled by the host page. |
| V2 | All content script resources must be registered with `DisposableRegistry` for deterministic teardown on `runtime.onSuspend`. |
| V3 | The WASM module uses `wasm-unsafe-eval` CSP; this must be justified in `amo-notes.md` for AMO review. |
| V4 | `coexistence.ts`, `shadow-host.ts`, `page-monitor.ts`, `disposable-registry.ts` are the **source of truth** for the commons coexistence primitives — they should be re-homed to `@some-extension/common` (#284) and this workspace should import from there. |

---

## Known gaps

- Local copies of coexistence primitives (`coexistence.ts`, `shadow-host.ts`, `page-monitor.ts`, `disposable-registry.ts`) should be deleted once commons extraction (#280–#282) lands; this workspace should become a consumer, not an owner (#284).
- `wasm-unsafe-eval` CSP justification must be documented per AMO B6 requirement (#320).

## ADRs

- [ADR 0001 — WASM state machine for cube rotation scheduling](./docs/adr/0001-wasm-rotation-state-machine.md)

## See also

- [README](./README.md) — full overview and cube geometry detail
- [AMO notes](./amo-notes.md) — wasm-unsafe-eval justification
- Issues: [#284 re-home onto commons](https://github.com/paulgsc/some-ui/issues/284) · [#320 wasm CSP justification](https://github.com/paulgsc/some-ui/issues/320)
- [Good-Citizen Charter](../common/GOOD_CITIZEN.md) §5–§8 (this extension is the reference)
