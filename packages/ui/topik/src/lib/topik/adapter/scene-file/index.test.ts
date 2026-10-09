import { describe, expect, it, vi } from "vitest"

import { SCENE_FILE_MAX_BYTES, SceneFileRuntime } from "."

/** A file whose read finishes, or fails, when the test says so. */
function slow(text: string): {
  file: { size: number; text: () => Promise<string> }
  finish: () => void
  fail: () => void
} {
  let finish: () => void = () => undefined
  let fail: () => void = () => undefined
  return {
    file: {
      size: text.length,
      text: (): Promise<string> =>
        new Promise((resolve, reject) => {
          finish = (): void => resolve(text)
          fail = (): void => reject(new Error("provider gone"))
        }),
    },
    finish: () => finish(),
    fail: () => fail(),
  }
}

describe("SceneFileRuntime", () => {
  it("lets only the latest pick through, however the reads finish", async () => {
    const runtime = new SceneFileRuntime()
    const first = slow("first")
    const second = slow("second")
    const read = vi.fn()
    runtime.open(first.file, read)
    runtime.open(second.file, read)
    expect(runtime.getSnapshot()).toEqual({ kind: "reading" })
    second.finish()
    first.finish()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    expect(read).toHaveBeenCalledWith("second")
    expect(runtime.getSnapshot()).toEqual({ kind: "idle" })
  })

  it("drops a read the learner walked away from", async () => {
    const runtime = new SceneFileRuntime()
    const file = slow("late")
    const read = vi.fn()
    runtime.open(file.file, read)
    runtime.cancel()
    file.finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(read).not.toHaveBeenCalled()
  })

  it("says why a read failed, and refuses a file too large to be a scene", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const runtime = new SceneFileRuntime()
    const file = slow("x")
    runtime.open(file.file, vi.fn())
    file.fail()
    await vi.waitFor(() =>
      expect(runtime.getSnapshot()).toEqual({
        kind: "failed",
        summary: "Couldn't open that file. Try again.",
      })
    )
    const text = vi.fn()
    runtime.open({ size: SCENE_FILE_MAX_BYTES + 1, text }, vi.fn())
    expect(text).not.toHaveBeenCalled()
    expect(runtime.getSnapshot()).toMatchObject({ kind: "failed" })
  })
})
