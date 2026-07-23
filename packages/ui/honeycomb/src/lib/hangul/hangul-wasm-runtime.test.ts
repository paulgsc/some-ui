import {
  getCoreInstance,
  loadHangulWasm,
  resetHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import { beforeEach, describe, expect, it, vi } from "vitest"

const hangulGameCoreCtor = vi.fn()

vi.mock("@some-ui/hangul-game-core", () => ({
  default: vi.fn().mockResolvedValue(undefined),
  // eslint-disable-next-line prefer-arrow-callback -- must be `new`-able (an arrow fn has no [[Construct]]), matching how hangul-wasm-runtime.ts calls `new module.HangulGameCore(...)`
  HangulGameCore: vi.fn(function MockHangulGameCore(...args: Array<unknown>) {
    hangulGameCoreCtor(...args)
  }),
}))

beforeEach(() => {
  resetHangulWasm()
  hangulGameCoreCtor.mockClear()
})

describe("loadHangulWasm mode switching", () => {
  // Regression coverage: the loader is a page-wide singleton (one WASM
  // module, one HangulGameCore instance). Before this fix, a later
  // loadHangulWasm() call with a different mode silently returned the
  // already-loaded core instead of constructing a new one, so switching
  // modes in the UI had no effect on actual gameplay after the first load.
  it("constructs a fresh core when called again with a different mode", async () => {
    await loadHangulWasm(undefined, "completion", [])
    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(hangulGameCoreCtor.mock.calls[0]?.[1]).toBe("completion")

    await loadHangulWasm(undefined, "vocabulary", [])
    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(2)
    expect(hangulGameCoreCtor.mock.calls[1]?.[1]).toBe("vocabulary")
  })

  it("does not reconstruct the core when called again with the same mode", async () => {
    await loadHangulWasm(undefined, "completion", [])
    await loadHangulWasm(undefined, "completion", [])

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
  })

  it("cycles through every mode without ever getting stuck on an earlier one", async () => {
    const modes = [
      "vocabulary",
      "completion",
      "endless",
      "vocabulary-endless",
      "completion",
    ] as const

    for (const [index, mode] of modes.entries()) {
      await loadHangulWasm(undefined, mode, [])
      expect(hangulGameCoreCtor).toHaveBeenCalledTimes(index + 1)
      expect(hangulGameCoreCtor.mock.calls[index]?.[1]).toBe(mode)
    }
  })

  it("exposes the freshly-constructed core via getCoreInstance after a mode switch", async () => {
    await loadHangulWasm(undefined, "completion", [])
    const first = getCoreInstance()

    await loadHangulWasm(undefined, "vocabulary", [])
    const second = getCoreInstance()

    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
  })
})
