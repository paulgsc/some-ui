import type { CrosswordClueState } from "@input/hooks/use-create-crossword-puzzle"
import { clueEvents } from "@input/hooks/use-create-crossword-puzzle"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useViewportManager } from "."

// ═══════════════════════════════════════════════════════════════════════════
// S5 — use-viewport-rotation-wasm.ts's `hasInitialized`/`managerRef` pair is
// the third wasm bridge named in #554. Unlike use-typing-game-wasm, it has
// no `.free()`/teardown call anywhere, and its `active` flag (the
// "execution deferred slightly to prevent synchronous-loop lints" effect at
// use-viewport-rotation-wasm.ts:394-406) is only checked *before* calling
// `initialize()`, never *during* its awaited body — so it does not actually
// guard the post-unmount continuation the way use-typing-game-wasm's
// `aliveRef` does. These tests pin both facts as they exist today, ahead of
// the refs/immutability fix #554 describes.
//
// `clueEvents` (imported by the hook via use-create-crossword-puzzle.ts) is
// a module-level singleton event bus — reset its state in beforeEach/
// afterEach so tests don't leak into each other.
// ═══════════════════════════════════════════════════════════════════════════

type FakeViewportManagerInstance = {
  resetCalls: number
  createdViewports: Array<string>
}

let instances: Array<FakeViewportManagerInstance>
let managerCtor: Mock
let initMock: Mock<() => Promise<void>>

function viewportState(viewId: string): unknown {
  return {
    viewportId: viewId,
    state: {
      faceIndices: [[0, 1]],
      currFace: 0,
      currIdx: 0,
      currRotationAxis: "X-axis",
      pendingCount: 0,
      cyclePosition: 0,
      queueIdx: 0,
    },
  }
}

vi.mock("@some-ui/viewport-rotation", () => {
  return {
    default: vi.fn(),
    ViewportManager: vi.fn(),
  }
})

function clue(word: string, clueNum: number): CrosswordClueWithNum {
  return { clue: `clue for ${word}`, word, clueNum }
}

const defaultClueState = {
  cluesAcross: [],
  cluesDown: [],
  lastRevealedAcrossIndex: 0,
  lastRevealedDownIndex: 0,
}

beforeEach(async () => {
  instances = []
  clueEvents.setState(() => ({ ...defaultClueState }))

  const mod = await import("@some-ui/viewport-rotation")
  initMock = vi
    .mocked(mod.default)
    .mockReset()
    .mockImplementation(() => Promise.resolve())
  // vitest 4 types a mocked class constructor as Mock<typeof ViewportManager>,
  // which requires satisfying both a call and a construct signature - something
  // no plain function value (the mockImplementation below) can ever provide.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  managerCtor = vi.mocked(mod.ViewportManager).mockReset() as unknown as Mock
  managerCtor.mockImplementation(function (this: FakeViewportManagerInstance) {
    this.resetCalls = 0
    this.createdViewports = []
    instances.push(this)
    return this
  })
  managerCtor.prototype.reset = function (
    this: FakeViewportManagerInstance
  ): void {
    this.resetCalls++
  }
  managerCtor.prototype.create_viewport = function (
    this: FakeViewportManagerInstance,
    viewId: string
  ): unknown {
    this.createdViewports.push(viewId)
    return viewportState(viewId)
  }
  managerCtor.prototype.list_viewports = function (
    this: FakeViewportManagerInstance
  ): { viewportIds: Array<string>; activeViewportId: string | null } {
    return {
      viewportIds: this.createdViewports,
      activeViewportId: this.createdViewports[0] ?? null,
    }
  }
})

afterEach(() => {
  clueEvents.setState(() => ({ ...defaultClueState }))
})

describe("lazy init", () => {
  it("does not load wasm or construct a manager when the clue queue is empty", async () => {
    const { result } = renderHook(() => useViewportManager({}))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(initMock).not.toHaveBeenCalled()
    expect(managerCtor).not.toHaveBeenCalled()
    expect(result.current.viewportIds).toEqual([])
  })

  it("loads wasm and constructs exactly one manager once the clue queue is non-empty", async () => {
    clueEvents.setState(() => ({
      ...defaultClueState,
      cluesAcross: [clue("cat", 1)],
      cluesDown: [clue("dog", 2)],
    }))

    const { result } = renderHook(() => useViewportManager({}))

    await waitFor(() =>
      expect(result.current.viewportIds.length).toBeGreaterThan(0)
    )

    expect(initMock).toHaveBeenCalledTimes(1)
    expect(managerCtor).toHaveBeenCalledTimes(1)
    expect(result.current.viewportIds.sort()).toEqual(["across", "down"])
  })
})

describe("re-render stability", () => {
  it("reuses the existing manager (calls reset(), not the constructor) when the clue queue is replaced with an equivalent one", async () => {
    clueEvents.setState(() => ({
      ...defaultClueState,
      cluesAcross: [clue("cat", 1)],
      cluesDown: [],
    }))

    const { result } = renderHook(() => useViewportManager({}))
    await waitFor(() => expect(managerCtor).toHaveBeenCalledTimes(1))

    const instance = instances[0]
    expect(instance).toBeDefined()

    // A brand-new array reference with the same shape — this is what
    // happens every time clueEvents.setState runs, even for a no-op update.
    act(() => {
      clueEvents.setState((prev: CrosswordClueState) => ({
        ...prev,
        cluesAcross: [...prev.cluesAcross],
      }))
    })

    await waitFor(() => expect(instance?.resetCalls).toBeGreaterThan(0))
    expect(managerCtor).toHaveBeenCalledTimes(1)
    expect(instances).toHaveLength(1)
    void result
  })
})

describe("unmount / teardown gap (characterizes the missing guard)", () => {
  it("has no teardown call on the manager when the hook unmounts after a successful init", async () => {
    clueEvents.setState(() => ({
      ...defaultClueState,
      cluesAcross: [clue("cat", 1)],
      cluesDown: [],
    }))

    const { result, unmount } = renderHook(() => useViewportManager({}))
    await waitFor(() => expect(managerCtor).toHaveBeenCalledTimes(1))
    void result

    // `ViewportManager` (real or fake) exposes no free()/dispose() method
    // today, and use-viewport-rotation-wasm.ts calls none on cleanup — the
    // effect's only cleanup action is flipping the local `active` flag.
    // This assertion is deliberately a no-op guard: it documents absence,
    // not presence.
    expect(() => unmount()).not.toThrow()
  })

  it("still applies an in-flight initialize()'s state updates after unmount — `active` is only checked before starting, not while awaiting", async () => {
    clueEvents.setState(() => ({
      ...defaultClueState,
      cluesAcross: [clue("cat", 1)],
      cluesDown: [],
    }))

    let releaseInit: (() => void) | undefined
    initMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseInit = resolve
        })
    )

    const { unmount } = renderHook(() => useViewportManager({}))
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1))

    unmount()
    expect(managerCtor).not.toHaveBeenCalled()

    await act(async () => {
      releaseInit?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Documents the current gap: the manager is still constructed and
    // `create_viewport` still runs even though the component already
    // unmounted, because `runInit`'s `if (active)` check only guards the
    // call to `initialize()`, not anything inside it.
    expect(managerCtor).toHaveBeenCalledTimes(1)
    expect(instances[0]?.createdViewports.length).toBeGreaterThan(0)
  })
})
