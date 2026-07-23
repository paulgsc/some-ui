import {
  getCoreInstance,
  loadHangulWasm,
  resetHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import { beforeEach, describe, expect, it, vi } from "vitest"

const hangulGameCoreCtor = vi.fn()
const changeMode = vi.fn()

vi.mock("@some-ui/hangul-game-core", () => ({
  default: vi.fn().mockResolvedValue(undefined),
  // eslint-disable-next-line prefer-arrow-callback -- must be `new`-able (an arrow fn has no [[Construct]]), matching how hangul-wasm-runtime.ts calls `new module.HangulGameCore(...)`
  HangulGameCore: vi.fn(function MockHangulGameCore(...args: Array<unknown>) {
    hangulGameCoreCtor(...args)
    return { changeMode, reset: vi.fn() }
  }),
}))

beforeEach(() => {
  resetHangulWasm()
  hangulGameCoreCtor.mockClear()
  changeMode.mockClear()
})

describe("loadHangulWasm mode switching", () => {
  // Regression coverage: the loader is a page-wide singleton (one WASM
  // module, one HangulGameCore instance, constructed exactly once). Before
  // the first fix, a later loadHangulWasm() call with a different mode
  // silently returned the already-loaded core untouched, so switching modes
  // in the UI had no effect on actual gameplay after the first load. The
  // correct fix (ADR 0004 §2(f)) is not to reconstruct the core on every
  // switch either - mode is runtime lifecycle state on the *existing*
  // engine (GameEngine::set_mode / HangulGameCore.changeMode), the same way
  // reset() already mutates state on the existing core rather than
  // requiring a new one.
  it("constructs the core exactly once and calls changeMode on later mode switches", async () => {
    await loadHangulWasm(undefined, "completion", [])
    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(hangulGameCoreCtor.mock.calls[0]?.[1]).toBe("completion")
    expect(changeMode).not.toHaveBeenCalled()

    await loadHangulWasm(undefined, "vocabulary", [])
    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).toHaveBeenCalledTimes(1)
    expect(changeMode).toHaveBeenLastCalledWith("vocabulary", [])
  })

  it("does not call changeMode when called again with the same mode", async () => {
    await loadHangulWasm(undefined, "completion", [])
    await loadHangulWasm(undefined, "completion", [])

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).not.toHaveBeenCalled()
  })

  it("cycles through every mode via changeMode, never reconstructing the core", async () => {
    const modes = [
      "vocabulary",
      "completion",
      "endless",
      "vocabulary-endless",
      "completion",
    ] as const

    await loadHangulWasm(undefined, modes[0], [])
    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)

    for (const mode of modes.slice(1)) {
      await loadHangulWasm(undefined, mode, [])
      expect(changeMode).toHaveBeenLastCalledWith(mode, [])
    }

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).toHaveBeenCalledTimes(modes.length - 1)
  })

  it("keeps the same core instance across a mode switch", async () => {
    await loadHangulWasm(undefined, "completion", [])
    const first = getCoreInstance()

    await loadHangulWasm(undefined, "vocabulary", [])
    const second = getCoreInstance()

    expect(second).not.toBeNull()
    expect(second).toBe(first)
  })
})
