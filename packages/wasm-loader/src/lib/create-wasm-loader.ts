export enum WasmLoaderState {
  Idle = "idle",
  Loading = "loading",
  Loaded = "loaded",
  Failed = "failed",
}

export type WasmLoaderErrorPolicy = "throw" | "resolve-null"

export type WasmLoaderStats = {
  state: WasmLoaderState
  isLoaded: boolean
  hasError: boolean
  errorMessage: string | null
  attempts: number
}

export type WasmLoaderOptions<T> = {
  /**
   * Performs the actual dynamic import (and any wasm-bindgen `default()`
   * init call) and resolves the loaded module. The loader has no crate-
   * specific knowledge - everything module-shape-specific belongs here.
   */
  importModule: () => Promise<T>
  /**
   * "throw" re-throws (and rejects `load()` with) the underlying error, so
   * `load()` never actually resolves `null` under this policy - a failure
   * always surfaces as a rejection instead. "resolve-null" resolves `null`
   * and surfaces the failure via `getLastError()`/`getState()` instead.
   * Defaults to "resolve-null".
   */
  errorPolicy?: WasmLoaderErrorPolicy
  /**
   * Extra automatic attempts within a single `load()` call before giving
   * up. Defaults to 0 (a single attempt) - this is distinct from the
   * always-on behavior that a *subsequent* `load()` call after a failure
   * starts a fresh attempt rather than joining the failed one.
   */
  maxRetries?: number
  /**
   * Returns true when running somewhere the module must not be loaded
   * (SSR). Defaults to `typeof window === "undefined"`. Guarded calls
   * resolve/reject per `errorPolicy` without touching loader state, so a
   * later call from the real client can still load normally.
   */
  isSSR?: () => boolean
}

export type WasmLoader<T> = {
  /**
   * Idempotent, race-safe, singleton load. Under the "throw" error policy
   * this never actually resolves `null` (it rejects instead) - callers on
   * that policy can treat a resolved value as always present.
   */
  load: () => Promise<T | null>
  /** Fire-and-forget warm-up; only starts a load when currently Idle. */
  preload: () => void
  /** Hard reset (HMR, test cleanup): clears module, state, and error. */
  reset: () => void
  /** Synchronous accessor for the already-loaded module, or null. */
  peek: () => T | null
  isLoaded: () => boolean
  getState: () => WasmLoaderState
  getLastError: () => Error | null
  getStats: () => WasmLoaderStats
}

const defaultIsSSR = (): boolean => typeof window === "undefined"

export function createWasmLoader<T>(
  options: WasmLoaderOptions<T>
): WasmLoader<T> {
  const {
    importModule,
    errorPolicy = "resolve-null",
    maxRetries = 0,
    isSSR = defaultIsSSR,
  } = options

  let state: WasmLoaderState = WasmLoaderState.Idle
  let moduleInstance: T | null = null
  let loadPromise: Promise<T | null> | null = null
  let lastError: Error | null = null
  let attempts = 0

  function fail(err: unknown): T | null {
    state = WasmLoaderState.Failed
    lastError = err instanceof Error ? err : new Error(String(err))
    moduleInstance = null
    // Cleared so the *next* load() call starts a fresh attempt instead of
    // joining this failed one.
    loadPromise = null

    if (errorPolicy === "throw") {
      throw lastError
    }
    return null
  }

  async function attemptLoad(): Promise<T | null> {
    let remaining = maxRetries
    for (;;) {
      attempts += 1
      try {
        const mod = await importModule()
        moduleInstance = mod
        state = WasmLoaderState.Loaded
        loadPromise = null
        return mod
      } catch (err) {
        if (remaining > 0) {
          remaining -= 1
          continue
        }
        return fail(err)
      }
    }
  }

  function load(): Promise<T | null> {
    // Fast path: already loaded.
    if (moduleInstance !== null && state === WasmLoaderState.Loaded) {
      return Promise.resolve(moduleInstance)
    }

    // In-flight: join the existing attempt instead of starting a second one.
    if (loadPromise) {
      return loadPromise
    }

    if (isSSR()) {
      const ssrError = new Error(
        "wasm-loader: cannot load a WASM module during SSR"
      )
      if (errorPolicy === "throw") {
        return Promise.reject(ssrError)
      }
      return Promise.resolve(null)
    }

    state = WasmLoaderState.Loading
    lastError = null

    loadPromise = attemptLoad()
    return loadPromise
  }

  function preload(): void {
    if (state === WasmLoaderState.Idle) {
      load().catch(() => {
        // Failure is already recorded on the loader (getLastError/getState);
        // preload() is fire-and-forget so nothing is awaiting this promise.
      })
    }
  }

  function reset(): void {
    state = WasmLoaderState.Idle
    moduleInstance = null
    loadPromise = null
    lastError = null
    attempts = 0
  }

  function peek(): T | null {
    return moduleInstance
  }

  function isLoaded(): boolean {
    return state === WasmLoaderState.Loaded && moduleInstance !== null
  }

  function getState(): WasmLoaderState {
    return state
  }

  function getLastError(): Error | null {
    return lastError
  }

  function getStats(): WasmLoaderStats {
    return {
      state,
      isLoaded: isLoaded(),
      hasError: lastError !== null,
      errorMessage: lastError?.message ?? null,
      attempts,
    }
  }

  return {
    load,
    preload,
    reset,
    peek,
    isLoaded,
    getState,
    getLastError,
    getStats,
  }
}
