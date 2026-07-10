import { afterEach, describe, expect, it, vi } from "vitest"

import { createWasmLoader, WasmLoaderState } from "./create-wasm-loader"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// vitest's "node" environment has no `window`, which would otherwise trip
// the default SSR guard for every test in this file that isn't specifically
// about that guard - opt those tests out explicitly, mirroring a real
// browser runtime where `window` exists.
const notSSR = { isSSR: (): boolean => false }

describe("createWasmLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("fast path", () => {
    it("returns the cached module on subsequent calls without re-importing", async () => {
      const mod = { value: 1 }
      const importModule = vi.fn().mockResolvedValue(mod)
      const loader = createWasmLoader({ importModule, ...notSSR })

      const first = await loader.load()
      const second = await loader.load()
      const third = await loader.load()

      expect(first).toBe(mod)
      expect(second).toBe(mod)
      expect(third).toBe(mod)
      expect(importModule).toHaveBeenCalledTimes(1)
      expect(loader.getState()).toBe(WasmLoaderState.Loaded)
      expect(loader.isLoaded()).toBe(true)
      expect(loader.peek()).toBe(mod)
    })
  })

  describe("concurrent-call join", () => {
    it("joins concurrent load() calls onto a single in-flight import", async () => {
      const mod = { value: 2 }
      const gate = deferred<typeof mod>()
      const importModule = vi.fn().mockReturnValue(gate.promise)
      const loader = createWasmLoader({ importModule, ...notSSR })

      const calls = [loader.load(), loader.load(), loader.load()]
      expect(loader.getState()).toBe(WasmLoaderState.Loading)

      gate.resolve(mod)
      const results = await Promise.all(calls)

      expect(results).toEqual([mod, mod, mod])
      expect(importModule).toHaveBeenCalledTimes(1)
    })
  })

  describe("error policy", () => {
    it("resolve-null: resolves null and records the error via getLastError/getState", async () => {
      const boom = new Error("boom")
      const importModule = vi.fn().mockRejectedValue(boom)
      const loader = createWasmLoader({
        importModule,
        errorPolicy: "resolve-null",
        ...notSSR,
      })

      const result = await loader.load()

      expect(result).toBeNull()
      expect(loader.getState()).toBe(WasmLoaderState.Failed)
      expect(loader.getLastError()).toBe(boom)
      expect(loader.isLoaded()).toBe(false)
    })

    it("throw: rejects load() and still records the error", async () => {
      const boom = new Error("boom")
      const importModule = vi.fn().mockRejectedValue(boom)
      const loader = createWasmLoader({
        importModule,
        errorPolicy: "throw",
        ...notSSR,
      })

      await expect(loader.load()).rejects.toBe(boom)
      expect(loader.getState()).toBe(WasmLoaderState.Failed)
      expect(loader.getLastError()).toBe(boom)
    })

    it("wraps a non-Error rejection reason in an Error", async () => {
      const importModule = vi.fn().mockRejectedValue("not an error")
      const loader = createWasmLoader({ importModule, ...notSSR })

      await loader.load()

      expect(loader.getLastError()).toBeInstanceOf(Error)
      expect(loader.getLastError()?.message).toBe("not an error")
    })
  })

  describe("retry after failure", () => {
    it("starts a fresh attempt on the next load() call instead of joining the failed one", async () => {
      const mod = { value: 3 }
      const importModule = vi
        .fn()
        .mockRejectedValueOnce(new Error("first failure"))
        .mockResolvedValueOnce(mod)
      const loader = createWasmLoader({ importModule, ...notSSR })

      const failed = await loader.load()
      expect(failed).toBeNull()
      expect(loader.getState()).toBe(WasmLoaderState.Failed)

      const succeeded = await loader.load()
      expect(succeeded).toBe(mod)
      expect(loader.getState()).toBe(WasmLoaderState.Loaded)
      expect(importModule).toHaveBeenCalledTimes(2)
    })
  })

  describe("maxRetries", () => {
    it("automatically retries within a single load() call up to maxRetries times", async () => {
      const mod = { value: 4 }
      const importModule = vi
        .fn()
        .mockRejectedValueOnce(new Error("attempt 1"))
        .mockRejectedValueOnce(new Error("attempt 2"))
        .mockResolvedValueOnce(mod)
      const loader = createWasmLoader({
        importModule,
        maxRetries: 2,
        ...notSSR,
      })

      const result = await loader.load()

      expect(result).toBe(mod)
      expect(importModule).toHaveBeenCalledTimes(3)
      expect(loader.getStats().attempts).toBe(3)
    })

    it("gives up and fails once maxRetries is exhausted", async () => {
      const importModule = vi.fn().mockRejectedValue(new Error("always fails"))
      const loader = createWasmLoader({
        importModule,
        maxRetries: 2,
        ...notSSR,
      })

      const result = await loader.load()

      expect(result).toBeNull()
      expect(importModule).toHaveBeenCalledTimes(3)
      expect(loader.getState()).toBe(WasmLoaderState.Failed)
    })
  })

  describe("reset", () => {
    it("clears state, module, and error so the next load() re-imports from scratch", async () => {
      const modA = { value: "a" }
      const modB = { value: "b" }
      const importModule = vi
        .fn()
        .mockResolvedValueOnce(modA)
        .mockResolvedValueOnce(modB)
      const loader = createWasmLoader({ importModule, ...notSSR })

      await loader.load()
      expect(loader.isLoaded()).toBe(true)

      loader.reset()

      expect(loader.getState()).toBe(WasmLoaderState.Idle)
      expect(loader.isLoaded()).toBe(false)
      expect(loader.peek()).toBeNull()
      expect(loader.getLastError()).toBeNull()

      const second = await loader.load()
      expect(second).toBe(modB)
      expect(importModule).toHaveBeenCalledTimes(2)
    })

    it("resets the attempt counter", async () => {
      const importModule = vi.fn().mockRejectedValue(new Error("nope"))
      const loader = createWasmLoader({
        importModule,
        maxRetries: 1,
        ...notSSR,
      })

      await loader.load()
      expect(loader.getStats().attempts).toBe(2)

      loader.reset()

      expect(loader.getStats().attempts).toBe(0)
    })
  })

  describe("preload", () => {
    it("starts a load only when idle", () => {
      const gate = deferred<{ value: number }>()
      const importModule = vi.fn().mockReturnValue(gate.promise)
      const loader = createWasmLoader({ importModule, ...notSSR })

      loader.preload()
      loader.preload()
      loader.preload()

      expect(importModule).toHaveBeenCalledTimes(1)
      expect(loader.getState()).toBe(WasmLoaderState.Loading)

      gate.resolve({ value: 1 })
    })

    it("does not throw or produce an unhandled rejection when the preloaded import fails", async () => {
      const importModule = vi.fn().mockRejectedValue(new Error("preload boom"))
      const loader = createWasmLoader({
        importModule,
        errorPolicy: "throw",
        ...notSSR,
      })

      expect(() => loader.preload()).not.toThrow()

      await vi.waitFor(() => {
        expect(loader.getState()).toBe(WasmLoaderState.Failed)
      })
    })
  })

  describe("SSR guard", () => {
    it("does not attempt to import and resolves null under resolve-null policy", async () => {
      const importModule = vi.fn()
      const loader = createWasmLoader({
        importModule,
        isSSR: () => true,
      })

      const result = await loader.load()

      expect(result).toBeNull()
      expect(importModule).not.toHaveBeenCalled()
      // SSR guard does not poison the loader's state - a later client call
      // (once isSSR() flips) can still load for real.
      expect(loader.getState()).toBe(WasmLoaderState.Idle)
    })

    it("rejects under throw policy without touching loader state", async () => {
      const importModule = vi.fn()
      const loader = createWasmLoader({
        importModule,
        errorPolicy: "throw",
        isSSR: () => true,
      })

      await expect(loader.load()).rejects.toThrow(/SSR/)
      expect(importModule).not.toHaveBeenCalled()
      expect(loader.getState()).toBe(WasmLoaderState.Idle)
    })

    it("defaults to treating a windowless environment as SSR", async () => {
      const importModule = vi.fn()
      const loader = createWasmLoader({ importModule })

      const result = await loader.load()

      expect(result).toBeNull()
      expect(importModule).not.toHaveBeenCalled()
    })
  })

  describe("introspection", () => {
    it("reports stats consistent with getState/isLoaded/getLastError", async () => {
      const mod = { value: 5 }
      const importModule = vi.fn().mockResolvedValue(mod)
      const loader = createWasmLoader({ importModule, ...notSSR })

      expect(loader.getStats()).toEqual({
        state: WasmLoaderState.Idle,
        isLoaded: false,
        hasError: false,
        errorMessage: null,
        attempts: 0,
      })

      await loader.load()

      expect(loader.getStats()).toEqual({
        state: WasmLoaderState.Loaded,
        isLoaded: true,
        hasError: false,
        errorMessage: null,
        attempts: 1,
      })
    })
  })
})
