import { describe, expect, it, vi } from "vitest"

import type { FileShare } from "."
import { ShareRuntime } from "."

type Outcome = Awaited<ReturnType<FileShare>>

/** A share sheet that answers when the test says so. */
function sheet(): {
  share: ReturnType<typeof vi.fn<() => Promise<Outcome>>>
  answer: (outcome: Outcome) => Promise<void>
} {
  let settle: (outcome: Outcome) => void = () => undefined
  return {
    share: vi.fn(
      (): Promise<Outcome> =>
        new Promise((resolve) => {
          settle = resolve
        })
    ),
    answer: async (outcome): Promise<void> => {
      settle(outcome)
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

const file = { name: "drama-1.prompt.md", text: "prompt" }

describe("ShareRuntime", () => {
  it("is shared only once the person sent it somewhere", async () => {
    const { share, answer } = sheet()
    const runtime = new ShareRuntime(share)
    const shared = vi.fn()
    runtime.start(file, shared)
    expect(runtime.getSnapshot()).toEqual({ kind: "sharing" })
    // A second tap while the sheet is open starts nothing.
    runtime.start(file, shared)
    expect(share).toHaveBeenCalledOnce()
    await answer({ status: "succeeded", value: "cancelled" })
    expect(runtime.getSnapshot()).toEqual({ kind: "idle" })
    expect(shared).not.toHaveBeenCalled()

    runtime.start(file, shared)
    await answer({ status: "succeeded", value: "shared" })
    expect(runtime.getSnapshot()).toEqual({ kind: "shared" })
    expect(shared).toHaveBeenCalledOnce()
  })

  it("withdraws on a build with no share sheet, and says why otherwise", async () => {
    const { share, answer } = sheet()
    const runtime = new ShareRuntime(share)
    runtime.start(file)
    await answer({
      status: "failed",
      error: {
        kind: "unknown",
        retryable: true,
        summary: "Try again.",
        cause: null,
      },
    })
    expect(runtime.getSnapshot()).toEqual({
      kind: "failed",
      summary: "Try again.",
    })
    runtime.start(file)
    await answer({
      status: "failed",
      error: {
        kind: "unavailable",
        retryable: false,
        summary: "None.",
        cause: null,
      },
    })
    expect(runtime.getSnapshot()).toEqual({ kind: "withdrawn" })
  })

  it("ignores an answer that arrives after it was let go", async () => {
    const { share, answer } = sheet()
    const runtime = new ShareRuntime(share)
    const shared = vi.fn()
    runtime.start(file, shared)
    runtime.dispose()
    await answer({ status: "succeeded", value: "shared" })
    expect(shared).not.toHaveBeenCalled()
    expect(runtime.getSnapshot()).toEqual({ kind: "idle" })
  })
})
