/**
 *
 * This file is intentionally minimal. It owns:
 *   - Runtime construction and teardown
 *   - Wiring ConveyorEngine to CoexistenceRuntime attention events
 *   - SPA navigation handling (popstate / hashchange)
 *
 * It does NOT own:
 *   - Business logic (ConveyorEngine)
 *   - State machines (WasmBridge / polyhedron)
 *   - Visual theming (ThemeEngine)
 *   - Face content (face-contents.ts)
 *
 * Extension-specific constraints enforced here:
 *   - Guard against duplicate injection (SPA navigations that don't unload).
 *   - Clean beforeunload to prevent rAF / observer leaks on reload.
 *   - CSS injected as a web_accessible_resource URL (shadow DOM scoped).
 */

import { buildConveyorZone } from "@conveyor/components/conveyor-zone"
import { CoexistenceRuntime } from "@conveyor/lib/content/coexistence"
import { ConveyorEngine } from "@conveyor/lib/content/conveyor-engine"
import { EffectBus } from "@conveyor/lib/content/effect-bus"
import { makeCubeFaceContents } from "@conveyor/lib/content/face-contents"
import { ThemeEngine } from "@conveyor/lib/content/theme-engine"
import { WasmBridge } from "@conveyor/lib/content/wasm-bridge"
import { ext } from "@conveyor/platform/content"
import type {
  AttentionMode,
  FaceAction,
  ViewportItemSpec,
} from "@conveyor/types"
import { DEFAULT_CONVEYOR_CONFIG } from "@conveyor/types"
import { assertNever } from "@some-extension/common"

// ── Stylesheet URL ────────────────────────────────────────────────────────────
// The shadow root loads the compiled stylesheet as a web_accessible_resource.
// `src/styles/conveyor.css` is authored with `@apply` against the @some-ui/styles
// preset and compiled to plain static CSS by `@unocss/cli` (the `build:css`
// script) → `dist/styles/conveyor.css`. We resolve it via the extension runtime
// rather than a Vite `?url` import so Vite never runs its CSS pipeline over the
// directive source; the build-time CLI is the single producer of this asset and
// no CSS engine ships to the page. `styles/*` is declared web_accessible_resources
// in both manifests.
const styleUrl = ext.runtime.getURL("styles/conveyor.css")

// ── Duplicate injection guard ───────────────────────────────────────────────────

const GUARD_ATTR = "data-some-conveyor-loaded"
if (document.documentElement.hasAttribute(GUARD_ATTR)) {
  // Script is being re-injected into an already-running page.
  // Bail immediately — the existing runtime is still valid.
  throw new Error("[some-conveyor] Already injected — skipping duplicate init.")
}
document.documentElement.setAttribute(GUARD_ATTR, "true")

// ── Runtime state ──────────────────────────────────────────────────────────────

let runtime: CoexistenceRuntime | null = null
let conveyor: ConveyorEngine | null = null

// ── Face action factory (per-cube) ────────────────────────────────────────────

function makeFaceActions(cubeId: string): Partial<Record<number, FaceAction>> {
  // Face 5 (the "action" face) opens the extension popup.
  // Face 0–4 are informational — no browser action on click.
  // Callers can override this per-cube for richer behaviour later.
  void cubeId // reserved for per-cube customisation
  return {
    5: { type: "ShowPopup" },
  }
}

// ── Viewport item factory (per-cube) ─────────────────────────────────────────

function makeViewportItems(_cubeId: string): Array<ViewportItemSpec> {
  // 12 content items with 5s each — one full epoch at capacity=3, 4 faces.
  // This drives the WASM face-assignment schedule.
  return Array.from({ length: 12 }, (_, i) => ({
    contentIndex: i,
    durationMs: 5_000,
  }))
}

// ── Manifest segments (static placeholder) ──────────────────────────────────────
// Display-only cargo manifest framing the cubes as scheduled content. Static for
// now; a later logic-layer issue can derive these from the live schedule.
const MANIFEST_SEGMENTS = [
  { cube: "01", face: "front", source: "ci/some-ui", window: "6.0s" },
  { cube: "02", face: "right", source: "nvda/journal", window: "9.0s" },
  { cube: "03", face: "top", source: "kor/단어", window: "12.0s" },
  { cube: "04", face: "back", source: "rss/rust-blog", window: "8.0s" },
  { cube: "05", face: "front", source: "metric/mrr", window: "6.0s" },
  { cube: "06", face: "bottom", source: "reminder/review", window: "9.0s" },
] as const

// ── Init ──────────────────────────────────────────────────────────────────────

function init(): void {
  if (runtime) return

  // Build the runtime (shadow DOM, page monitor, disposable registry).
  runtime = new CoexistenceRuntime(styleUrl)

  // Build shared services.
  const wasmBridge = runtime.register(new WasmBridge())
  const themeEngine = new ThemeEngine()
  const effectBus = runtime.register(new EffectBus())

  // Pre-warm WASM — don't block rendering on it.
  wasmBridge
    .initialize()
    // eslint-disable-next-line no-console
    .catch((e: unknown) => console.error("[some-conveyor] WASM init error:", e))

  // Assemble the instrumentation zone (rail → manifest → belt) and mount it in
  // the shadow root. The belt renders into the zone's belt mount. Rail/manifest
  // values are static for now (typed seams for a later logic-layer issue).
  const zone = buildConveyorZone({ manifestSegments: MANIFEST_SEGMENTS })
  runtime.mountPoint.appendChild(zone.root)

  // Build the conveyor and register it for lifecycle management.
  conveyor = runtime.register(
    new ConveyorEngine(
      zone.beltMount,
      wasmBridge,
      themeEngine,
      effectBus,
      DEFAULT_CONVEYOR_CONFIG,
      makeCubeFaceContents,
      makeFaceActions,
      makeViewportItems
    )
  )

  // The conveyor only runs for a foreground tab in a blurred window (see
  // PageMonitor). Build the cube pool + begin the rAF loop lazily on the first
  // such activation, so a tab that loads focused — the common case — renders
  // nothing at all, and yields cleanly (rAF suspended) on every refocus.
  let started = false
  const activate = (mode: AttentionMode): void => {
    if (!started) {
      // Stay dormant until the first live moment — no pool, no frames.
      if (mode === "Suspended") return
      started = true
      conveyor
        ?.start()
        // Reconcile against the live mode in case it changed during the
        // async pool build (e.g. the window refocused).
        .then(() =>
          conveyor?.handleAttentionChange(runtime?.attentionMode ?? mode)
        )
        .catch((e: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[some-conveyor] conveyor start error:", e)
        })
      return
    }
    conveyor?.handleAttentionChange(mode)
  }

  // Wire attention mode → lazy start / suspend / resume, then sync to the
  // current state (only actually starts if we loaded live).
  runtime.on("attentionChange", activate)
  activate(runtime.attentionMode)

  // eslint-disable-next-line no-console
  console.debug("[some-conveyor] Runtime initialised.")
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown(): void {
  runtime?.dispose()
  runtime = null
  conveyor = null
  document.documentElement.removeAttribute(GUARD_ATTR)
  // eslint-disable-next-line no-console
  console.debug("[some-conveyor] Runtime torn down.")
}

// ── Lifecycle hooks ───────────────────────────────────────────────────────────

window.addEventListener("beforeunload", teardown)

// SPA navigation: treat popstate/hashchange as a signal to re-evaluate.
// Some SPAs navigate without unloading — the conveyor stays alive through
// navigation but we want to ensure the guard stays correct.
const handleSpaNav = (): void => {
  // Currently a no-op: the conveyor is page-agnostic.
  // Add URL-based show/hide logic here if needed (e.g., hide on specific routes).
}
window.addEventListener("popstate", handleSpaNav)
window.addEventListener("hashchange", handleSpaNav)

// ── Message handler (from background service worker) ─────────────────────────
type ConveyorMsg =
  | { type: "CONVEYOR_SUSPEND" }
  | { type: "CONVEYOR_RESUME" }
  | { type: "CONVEYOR_THEME" }

function isConveyorMsg(v: unknown): v is ConveyorMsg {
  // 1. Narrow to a non-null object that contains the key "type".
  if (typeof v !== "object" || v === null || !("type" in v)) {
    return false
  }

  // 2. In TS 4.9+, `in` safely narrows `v` so `v.type` is typed as `unknown`.
  const msgType = v.type

  // 3. Direct comparison avoids array typing issues and narrows correctly.
  return (
    msgType === "CONVEYOR_SUSPEND" ||
    msgType === "CONVEYOR_RESUME" ||
    msgType === "CONVEYOR_THEME"
  )
}

ext.runtime.onMessage.addListener((message: unknown): void => {
  if (!isConveyorMsg(message)) return

  const { type: t } = message
  switch (t) {
    case "CONVEYOR_SUSPEND": {
      // PageMonitor re-evaluates attention state automatically.
      conveyor?.suspend()
      break
    }
    case "CONVEYOR_RESUME": {
      conveyor?.resume()
      break
    }
    case "CONVEYOR_THEME": {
      // Future: receive theme name from popup and apply.
      break
    }
    default: {
      t satisfies never
      assertNever(t)
    }
  }
})

// ── Entry ─────────────────────────────────────────────────────────────────────

try {
  init()
} catch (e: unknown) {
  // eslint-disable-next-line no-console
  console.error("[some-conveyor] Init failed:", e)
}
