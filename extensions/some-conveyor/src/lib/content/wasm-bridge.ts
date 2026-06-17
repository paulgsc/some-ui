import type {
  Disposable,
  ViewportCreateOptions,
  ViewportState,
} from "@conveyor/types"

/**
 * WasmBridge
 *
 * Thin wrapper around the polyhedron WASM crate's WasmViewportManager.
 * No React. No hooks. No lifecycle magic.
 *
 * Responsibilities:
 *   - Load the WASM module once (singleton, race-safe)
 *   - Expose synchronous getState() and async tick/transition APIs
 *   - Provide a per-viewport Disposable handle
 *
 * The manager instance is shared across all CubeInstances in the extension.
 * Each cube calls createViewport() with a unique id and disposes via the
 * returned ViewportHandle.
 *
 * WASM loading strategy:
 *   Dynamic import("polyhedron") through Vite's WASM plugin.
 *   The bundler owns the WASM binary path — no manual fetch() or
 *   WebAssembly.instantiate() calls.
 */

// Inline minimal typing for the WASM module to avoid importing from the
// polyhedron package directly (which would pull in wasm-bindgen glue that
// expects a React-adjacent bundler environment during type-check).
type WasmViewportManager = {
  createViewport(
    id: string,
    items: unknown,
    polyhedron: unknown,
    faceCapacity: number,
    cycleName?: string
  ): unknown
  getState(id: string): unknown
  applyTransition(id: string, transition: unknown): unknown
  tick(id: string, dtMs: number): boolean
  removeViewport(id: string): boolean
  listViewports(): unknown
  clear(): void
}

type PolyhedronModule = {
  default?: () => Promise<void>
  WasmViewportManager: new () => WasmViewportManager
}

// ── Singleton load state ───────────────────────────────────────────────────────

type LoadState =
  | { status: "idle" }
  | { status: "loading"; promise: Promise<WasmViewportManager> }
  | { status: "ready"; manager: WasmViewportManager }
  | { status: "failed"; error: Error }

let loadState: LoadState = { status: "idle" }

async function ensureManager(): Promise<WasmViewportManager> {
  if (loadState.status === "ready") return loadState.manager
  if (loadState.status === "failed") throw loadState.error
  if (loadState.status === "loading") return loadState.promise

  const promise = (async () => {
    try {
      // eslint-disable-next-line import/no-unresolved, @typescript-eslint/consistent-type-assertions
      const mod = (await import("polyhedron")) as PolyhedronModule
      if (typeof mod.default === "function") {
        await mod.default()
      }
      const manager = new mod.WasmViewportManager()
      loadState = { status: "ready", manager }
      return manager
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      loadState = { status: "failed", error }
      throw error
    }
  })()

  loadState = { status: "loading", promise }
  return promise
}

// ── ViewportHandle ─────────────────────────────────────────────────────────────

/**
 * Handle for a single viewport instance.
 * Obtained via WasmBridge.createViewport().
 */
export class ViewportHandle implements Disposable {
  private disposed = false

  constructor(
    private readonly id: string,
    private readonly manager: WasmViewportManager,
    private _state: ViewportState
  ) {}

  get state(): ViewportState {
    return this._state
  }

  refreshState(): ViewportState {
    if (this.disposed) return this._state
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const raw = this.manager.getState(this.id) as ViewportState
    this._state = raw
    return raw
  }

  tick(dtMs: number): boolean {
    if (this.disposed) return false
    const advanced = this.manager.tick(this.id, dtMs)
    if (advanced) this.refreshState()
    return advanced
  }

  applyTransition(transition: unknown): ViewportState {
    if (this.disposed) return this._state
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const raw = this.manager.applyTransition(
      this.id,
      transition
    ) as ViewportState
    this._state = raw
    return raw
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      this.manager.removeViewport(this.id)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[WasmBridge] Error removing viewport "${this.id}":`, e)
    }
  }
}

// ── WasmBridge ─────────────────────────────────────────────────────────────────

/**
 * WasmBridge is the single access point for the polyhedron WASM crate.
 * Instantiate once, share across the entire extension runtime.
 */
export class WasmBridge implements Disposable {
  private manager: WasmViewportManager | null = null
  private readonly handles = new Map<string, ViewportHandle>()
  private disposed = false

  /** Must be called before createViewport(). Idempotent. */
  async initialize(): Promise<void> {
    if (this.manager) return
    this.manager = await ensureManager()
  }

  async createViewport(opts: ViewportCreateOptions): Promise<ViewportHandle> {
    if (!this.manager) {
      await this.initialize()
    }
    const mgr = this.manager!

    const items = opts.items
    const polyhedron = opts.polyhedron

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const rawState = mgr.createViewport(
      opts.id,
      items,
      polyhedron,
      opts.faceCapacity,
      opts.cycleName
    ) as ViewportState

    const handle = new ViewportHandle(opts.id, mgr, rawState)
    this.handles.set(opts.id, handle)
    return handle
  }

  getHandle(id: string): ViewportHandle | undefined {
    return this.handles.get(id)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const handle of this.handles.values()) {
      handle.dispose()
    }
    this.handles.clear()
    this.manager?.clear()
    this.manager = null
  }
}
