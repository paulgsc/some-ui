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

import { ext } from "@censor/platform/content"
import { CoexistenceRuntime } from "@conveyor/lib/content/coexistence"
import { ConveyorEngine } from "@conveyor/lib/content/conveyor-engine"
import { EffectBus } from "@conveyor/lib/content/effect-bus"
import { makeCubeFaceContents } from "@conveyor/lib/content/face-contents"
import { ThemeEngine } from "@conveyor/lib/content/theme-engine"
import { WasmBridge } from "@conveyor/lib/content/wasm-bridge"
import type { FaceAction, ViewportItemSpec } from "@conveyor/types"
import { DEFAULT_CONVEYOR_CONFIG } from "@conveyor/types"

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

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
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

  // Build the conveyor and register it for lifecycle management.
  conveyor = runtime.register(
    new ConveyorEngine(
      runtime.mountPoint,
      wasmBridge,
      themeEngine,
      effectBus,
      DEFAULT_CONVEYOR_CONFIG,
      makeCubeFaceContents,
      makeFaceActions,
      makeViewportItems
    )
  )

  // Wire attention mode → conveyor suspend/resume.
  runtime.on("attentionChange", (mode) => {
    conveyor?.handleAttentionChange(mode)
  })

  // Start the conveyor (builds cube pool, begins rAF loop).
  await conveyor.start()

  // eslint-disable-next-line no-console
  console.debug("[some-conveyor] Runtime started.")
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

type ConveyorMsg = { type: string }

function isConveyorMsg(v: unknown): v is ConveyorMsg {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    typeof v.type === "string"
  )
}

ext.runtime.onMessage.addListener((message: unknown): void => {
  if (!isConveyorMsg(message)) return

  switch (message.type) {
    case "CONVEYOR_SUSPEND":
      // PageMonitor re-evaluates attention state automatically.
      conveyor?.suspend()
      break
    case "CONVEYOR_RESUME":
      conveyor?.resume()
      break
    case "CONVEYOR_THEME":
      // Future: receive theme name from popup and apply.
      break
  }
})

// ── Entry ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console
init().catch((e: unknown) => console.error("[some-conveyor] Init failed:", e))
