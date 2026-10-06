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
  // The core is a page-wide singleton; a mode switch is changeMode on the
  // existing core (ADR 0004 §2(f)), never a reconstruction.
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

describe("loadHangulWasm sessionKey", () => {
  // Two sessions on the same mode must not share a board: the caller's
  // sessionKey is diffed against the last one seen.
  it("calls changeMode when sessionKey changes even though mode is unchanged", async () => {
    await loadHangulWasm(undefined, "completion", [], "session-a")
    expect(changeMode).not.toHaveBeenCalled()

    await loadHangulWasm(undefined, "completion", [], "session-b")

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).toHaveBeenCalledTimes(1)
    expect(changeMode).toHaveBeenLastCalledWith("completion", [])
  })

  it("does not call changeMode when both mode and sessionKey are unchanged", async () => {
    await loadHangulWasm(undefined, "completion", [], "session-a")
    await loadHangulWasm(undefined, "completion", [], "session-a")

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).not.toHaveBeenCalled()
  })

  it("does not call changeMode on the very first load, even with a sessionKey present", async () => {
    await loadHangulWasm(undefined, "completion", [], "session-a")

    expect(hangulGameCoreCtor).toHaveBeenCalledTimes(1)
    expect(changeMode).not.toHaveBeenCalled()
  })

  it("still only calls changeMode once when both mode and sessionKey change together", async () => {
    await loadHangulWasm(undefined, "completion", [], "session-a")
    await loadHangulWasm(undefined, "vocabulary", [], "session-b")

    expect(changeMode).toHaveBeenCalledTimes(1)
  })

  it("treats an absent sessionKey consistently across calls (no spurious reset)", async () => {
    await loadHangulWasm(undefined, "completion", [])
    await loadHangulWasm(undefined, "completion", [])

    expect(changeMode).not.toHaveBeenCalled()
  })
})
