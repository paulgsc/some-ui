import type * as IntentKit from "@some-ui/intent-kit"
import { afterEach, describe, expect, it, vi } from "vitest"

const plugin = vi.hoisted(() => {
  const heard: Array<(words: string) => void> = []
  return {
    available: vi.fn(
      (): Promise<{ available: boolean }> =>
        Promise.resolve({ available: true })
    ),
    start: vi.fn(
      (): Promise<{ words: string }> => Promise.resolve({ words: "" })
    ),
    stop: vi.fn((): Promise<void> => Promise.resolve()),
    cancel: vi.fn((): Promise<void> => Promise.resolve()),
    heard,
  }
})

vi.mock("@/lib/device-listen/native", () => ({
  available: plugin.available,
  start: plugin.start,
  stop: plugin.stop,
  cancel: plugin.cancel,
  onWords: (
    listener: (words: string) => void
  ): Promise<{ remove: () => Promise<void> }> => {
    plugin.heard.push(listener)
    return Promise.resolve({ remove: () => Promise.resolve() })
  },
}))

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<typeof IntentKit>()),
  reportFailure: vi.fn(),
}))

const { deviceListener } = await import("@/lib/device-listen")

afterEach(() => {
  plugin.heard.length = 0
  vi.clearAllMocks()
})

function failing(code: string): Promise<{ words: string }> {
  return Promise.reject(Object.assign(new Error(code), { code }))
}

describe("the phone's recognizer, for ideas", () => {
  it("passes on the words as they settle, then what was heard", async () => {
    let finish: (words: string) => void = () => undefined
    plugin.start.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = (words): void => resolve({ words })
        })
    )
    const partial: Array<string> = []
    const listening = deviceListener.listen((words) => partial.push(words))
    await vi.waitFor(() => expect(plugin.heard).toHaveLength(1))
    plugin.heard[0]?.("a short")
    finish("a short about game day")
    expect(await listening.done).toEqual({
      kind: "heard",
      words: "a short about game day",
    })
    expect(partial).toEqual(["a short"])
  })

  it.each(["DENIED", "UNIMPLEMENTED"])(
    "turns %s into a phone that can't listen",
    async (code) => {
      plugin.start.mockImplementationOnce(() => failing(code))
      expect(await deviceListener.listen(() => undefined).done).toEqual({
        kind: "unavailable",
      })
    }
  )

  it("turns anything else into a failure, never a rejection", async () => {
    plugin.start.mockImplementationOnce(() => failing("FAILED"))
    expect(await deviceListener.listen(() => undefined).done).toEqual({
      kind: "failed",
    })
  })

  it("never starts a listening let go while it was being set up", async () => {
    const listening = deviceListener.listen(() => undefined)
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it("tells the plugin to stop listening when a started one is let go", async () => {
    plugin.start.mockImplementationOnce(() => new Promise(() => undefined))
    const listening = deviceListener.listen(() => undefined)
    await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledOnce())
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalled())
  })

  it("lets go of a listening, telling the plugin", async () => {
    plugin.start.mockImplementationOnce(() => new Promise(() => undefined))
    const listening = deviceListener.listen(() => undefined)
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalledOnce())
  })

  it("says whether the phone can listen, and no when asking fails", async () => {
    expect(await deviceListener.available()).toBe(true)
    plugin.available.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("x"), { code: "UNIMPLEMENTED" }))
    )
    expect(await deviceListener.available()).toBe(false)
  })
})
