import type * as IntentKit from "@some-ui/intent-kit"
import { microphoneOwner } from "@some-ui/voice-capture"
import { afterEach, describe, expect, it, vi } from "vitest"

const plugin = vi.hoisted(() => {
  const heard: Array<(words: string) => void> = []
  const asked: Array<() => void> = []
  const readied: Array<() => void> = []
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
    asked,
    readied,
  }
})

vi.mock("@/lib/device-listen/native", () => {
  const handle = (): Promise<{ remove: () => Promise<void> }> =>
    Promise.resolve({ remove: () => Promise.resolve() })
  return {
    available: plugin.available,
    start: plugin.start,
    stop: plugin.stop,
    cancel: plugin.cancel,
    onWords: (listener: (words: string) => void): ReturnType<typeof handle> => {
      plugin.heard.push(listener)
      return handle()
    },
    onAsking: (listener: () => void): ReturnType<typeof handle> => {
      plugin.asked.push(listener)
      return handle()
    },
    onReady: (listener: () => void): ReturnType<typeof handle> => {
      plugin.readied.push(listener)
      return handle()
    },
  }
})

vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<typeof IntentKit>()),
  reportFailure: vi.fn(),
}))

const { createDeviceListener, deviceListener } = await import(
  "@/lib/device-listen"
)
const { reportFailure } = await import("@some-ui/intent-kit")

afterEach(() => {
  plugin.heard.length = 0
  plugin.asked.length = 0
  plugin.readied.length = 0
  vi.clearAllMocks()
})

function failing(code: string): Promise<{ words: string }> {
  return Promise.reject(Object.assign(new Error(code), { code }))
}

/** A start the test settles, or never does. */
function startHeld(): { finish: (words: string) => void } {
  let finish: (words: string) => void = () => undefined
  plugin.start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = (words): void => resolve({ words })
      })
  )
  return { finish: (words) => finish(words) }
}

/** Says the plugin is ready, or asking, once the listening has subscribed. */
async function plugged(): Promise<{
  ready: () => void
  asking: () => void
  say: (words: string) => void
}> {
  await vi.waitFor(() => expect(plugin.start).toHaveBeenCalledOnce(), {
    interval: 2,
  })
  return {
    ready: () => plugin.readied[0]?.(),
    asking: () => plugin.asked[0]?.(),
    say: (words) => plugin.heard[0]?.(words),
  }
}

const SHORT = { readyMs: 80, promptMs: 200, stopMs: 80, listenMs: 500 }

describe("the phone's recognizer, for ideas", () => {
  it("passes on the words as they settle, then what was heard", async () => {
    const { finish } = startHeld()
    const partial: Array<string> = []
    const listening = deviceListener.listen(
      (words) => partial.push(words),
      () => undefined
    )
    const { say } = await plugged()
    say("a short")
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
      expect(
        await deviceListener.listen(
          () => undefined,
          () => undefined
        ).done
      ).toEqual({ kind: "unavailable" })
    }
  )

  it("turns anything else into a failure, never a rejection", async () => {
    plugin.start.mockImplementationOnce(() => failing("FAILED"))
    expect(
      await deviceListener.listen(
        () => undefined,
        () => undefined
      ).done
    ).toEqual({ kind: "failed" })
  })

  it("never starts a listening let go while it was being set up", async () => {
    const listening = deviceListener.listen(
      () => undefined,
      () => undefined
    )
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it("never starts a listening stopped while it was being set up", async () => {
    const listening = deviceListener.listen(
      () => undefined,
      () => undefined
    )
    listening.stop()
    expect(await listening.done).toEqual({ kind: "heard", words: "" })
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it("tells the plugin to stop listening when a started one is let go", async () => {
    startHeld()
    const listening = deviceListener.listen(
      () => undefined,
      () => undefined
    )
    await plugged()
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalled())
  })

  it("says whether the phone can listen, and no when asking fails", async () => {
    expect(await deviceListener.available()).toBe(true)
    plugin.available.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("x"), { code: "UNIMPLEMENTED" }))
    )
    expect(await deviceListener.available()).toBe(false)
  })
})

describe("the recognizer borrows the phone's one microphone", () => {
  it("does not start while a take holds the microphone, and says it did not", async () => {
    const owner = microphoneOwner()
    const take = owner.claim("take")
    const listening = createDeviceListener(SHORT, owner).listen(
      () => undefined,
      () => undefined
    )
    expect(await listening.done).toEqual({ kind: "notStarted" })
    expect(plugin.start).not.toHaveBeenCalled()
    take?.release()
  })

  it("holds the microphone while it listens, and gives it back once it ends", async () => {
    const owner = microphoneOwner()
    const { finish } = startHeld()
    const listening = createDeviceListener(SHORT, owner).listen(
      () => undefined,
      () => undefined
    )
    await plugged()
    expect(owner.holder()).toBe("recognizer")
    expect(owner.claim("take")).toBeNull()
    finish("a note")
    await listening.done
    await vi.waitFor(() => expect(owner.holder()).toBeNull())
  })
})

/**
 * LS1: the recognizer's answers × the calls × when they come. Each row is
 * one behaviour of the plugin; the deadlines are short so a withheld
 * callback shows within the test.
 */
describe("LS1: a tap that starts or stops listening is answered in human time", () => {
  const listener = createDeviceListener(SHORT)

  it("says it is ready once the recognizer is", async () => {
    const { finish } = startHeld()
    const ready = vi.fn()
    const listening = listener.listen(() => undefined, ready)
    const plugged_ = await plugged()
    plugged_.ready()
    expect(ready).toHaveBeenCalledOnce()
    finish("heard")
    expect(await listening.done).toEqual({ kind: "heard", words: "heard" })
    expect(reportFailure).not.toHaveBeenCalled()
  })

  it("ends as not started, letting the recognizer go, when ready never comes", async () => {
    startHeld()
    const ready = vi.fn()
    const listening = listener.listen(() => undefined, ready)
    await plugged()
    expect(await listening.done).toEqual({ kind: "notStarted" })
    expect(ready).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalledOnce())
    expect(reportFailure).toHaveBeenCalledOnce()
  })

  it("waits for a person while the microphone prompt is up, then for ready", async () => {
    const { finish } = startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { asking, ready } = await plugged()
    asking()
    await new Promise((resolve) => setTimeout(resolve, SHORT.readyMs + 20))
    ready()
    finish("after the prompt")
    expect(await listening.done).toEqual({
      kind: "heard",
      words: "after the prompt",
    })
  })

  it("ends as not started when the prompt is answered but ready never comes", async () => {
    startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { asking } = await plugged()
    asking()
    expect(await listening.done).toEqual({ kind: "notStarted" })
  })

  it("keeps a ready recognizer listening past the ready deadline", async () => {
    const { finish } = startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready } = await plugged()
    ready()
    await new Promise((resolve) => setTimeout(resolve, SHORT.readyMs + 20))
    finish("a long answer")
    expect(await listening.done).toEqual({
      kind: "heard",
      words: "a long answer",
    })
    expect(plugin.cancel).not.toHaveBeenCalled()
  })

  it("ends a ready recognizer that never answers by the listening deadline", async () => {
    startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready } = await plugged()
    ready()
    expect(await listening.done).toEqual({ kind: "failed" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalled())
  })

  it("hands over what the recognizer answers to a stop", async () => {
    const { finish } = startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready } = await plugged()
    ready()
    listening.stop()
    await vi.waitFor(() => expect(plugin.stop).toHaveBeenCalledOnce())
    finish("all of it")
    expect(await listening.done).toEqual({ kind: "heard", words: "all of it" })
    expect(plugin.cancel).not.toHaveBeenCalled()
  })

  it("ends a stop the recognizer never answers with the words heard so far", async () => {
    startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready, say } = await plugged()
    ready()
    say("so far")
    listening.stop()
    expect(await listening.done).toEqual({ kind: "heard", words: "so far" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalledOnce())
    expect(reportFailure).toHaveBeenCalledOnce()
  })

  it("keeps the words so far when the listening deadline ends a stopped listening first", async () => {
    const soon = createDeviceListener({ ...SHORT, listenMs: 120, stopMs: 400 })
    startHeld()
    const listening = soon.listen(
      () => undefined,
      () => undefined
    )
    const { ready, say } = await plugged()
    ready()
    say("nearly")
    listening.stop()
    expect(await listening.done).toEqual({ kind: "heard", words: "nearly" })
    await vi.waitFor(() => expect(plugin.cancel).toHaveBeenCalledOnce())
  })

  it("ends a stop before ready with nothing, when the recognizer never answers", async () => {
    startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    await plugged()
    listening.stop()
    expect(await listening.done).toEqual({ kind: "heard", words: "" })
  })

  it("stops once, however often it is asked", async () => {
    const { finish } = startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready } = await plugged()
    ready()
    listening.stop()
    listening.stop()
    finish("")
    expect(await listening.done).toEqual({ kind: "heard", words: "" })
    await vi.waitFor(() => expect(plugin.stop).toHaveBeenCalledOnce())
  })

  it("lets a stopped listening go before its stop deadline", async () => {
    startHeld()
    const listening = listener.listen(
      () => undefined,
      () => undefined
    )
    const { ready } = await plugged()
    ready()
    listening.stop()
    listening.cancel()
    expect(await listening.done).toEqual({ kind: "failed" })
  })

  it("ignores words and ready after the listening was let go", async () => {
    startHeld()
    const words = vi.fn()
    const ready = vi.fn()
    const listening = listener.listen(words, ready)
    const plugged_ = await plugged()
    listening.cancel()
    await listening.done
    plugged_.ready()
    plugged_.say("late")
    expect(words).not.toHaveBeenCalled()
    expect(ready).not.toHaveBeenCalled()
  })
})
