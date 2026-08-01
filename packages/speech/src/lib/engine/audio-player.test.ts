import { isAbortError } from "@speech/lib/promise/abort"
import {
  createFakeAudioContextHandle,
  flushAsync,
  track,
} from "@speech/lib/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createAudioPlayer } from "./audio-player"

const AUDIO = (): ArrayBuffer => new ArrayBuffer(8)

describe("createAudioPlayer - settlement", () => {
  it("resolves when the buffer finishes playing", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const settlement = track(player.play(AUDIO()))
    await flushAsync()
    expect(settlement.state).toBe("pending")
    expect(player.pending).toBe(1)

    audio.current?.finishCurrent()
    await settlement.promise

    expect(settlement.state).toBe("resolved")
    expect(player.pending).toBe(0)
  })

  it("rejects with the underlying error when decoding fails", async () => {
    const audio = createFakeAudioContextHandle({
      decodeError: new Error("bad mp3"),
    })
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const settlement = track(player.play(AUDIO()))
    await settlement.promise

    expect(settlement.state).toBe("rejected")
    expect(settlement.error?.message).toBe("bad mp3")
    expect(isAbortError(settlement.error)).toBe(false)
    expect(player.pending).toBe(0)
  })

  it("rejects with an AbortError when the caller's signal aborts mid-playback", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })
    const controller = new AbortController()

    const settlement = track(
      player.play(AUDIO(), { signal: controller.signal })
    )
    await flushAsync()
    expect(settlement.state).toBe("pending")

    controller.abort()
    await settlement.promise

    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(true)
    expect(player.pending).toBe(0)
  })

  it("flushes every outstanding promise on stop, before stop returns", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const first = track(player.play(AUDIO()))
    const second = track(player.play(AUDIO()))
    const third = track(player.play(AUDIO()))
    await flushAsync()
    expect(player.pending).toBe(3)

    player.stop()

    // The observable part of the contract: the ledger is empty the instant
    // `stop()` returns, not a tick later. This is what the pre-rewrite
    // implementation got wrong - it replaced its queue with a fresh
    // `Promise.resolve()` and left the old promises pending forever.
    expect(player.pending).toBe(0)

    await flushAsync()
    for (const settlement of [first, second, third]) {
      expect(settlement.state).toBe("rejected")
      expect(isAbortError(settlement.error)).toBe(true)
    }
  })

  it("queues overlapping plays instead of overlapping them", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const first = track(player.play(AUDIO()))
    const second = track(player.play(AUDIO()))
    await flushAsync()

    // Only the first has reached the audio graph.
    expect(audio.current?.sources).toHaveLength(1)

    audio.current?.finishCurrent()
    await first.promise
    await flushAsync()

    expect(audio.current?.sources).toHaveLength(2)
    expect(second.state).toBe("pending")

    audio.current?.finishCurrent()
    await second.promise
    expect(second.state).toBe("resolved")
  })

  it("does not wedge the queue when a stopped play is followed by a new one", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const abandoned = track(player.play(AUDIO()))
    await flushAsync()
    player.stop()
    await flushAsync()
    expect(abandoned.state).toBe("rejected")

    // The regression this pins: the next utterance used to chain behind a
    // promise that would never settle, so nothing ever played again.
    const revived = track(player.play(AUDIO()))
    await flushAsync()
    audio.current?.finishCurrent()
    await revived.promise

    expect(revived.state).toBe("resolved")
  })

  it("is terminal once disposed", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const inFlight = track(player.play(AUDIO()))
    await flushAsync()
    player.dispose()
    expect(player.pending).toBe(0)
    await flushAsync()
    expect(isAbortError(inFlight.error)).toBe(true)

    const afterwards = track(player.play(AUDIO()))
    await flushAsync()
    expect(afterwards.state).toBe("rejected")
    expect(isAbortError(afterwards.error)).toBe(true)
    expect(player.disposed).toBe(true)
  })

  it("does not settle a stale entry when its node is torn down", async () => {
    const audio = createFakeAudioContextHandle()
    const player = createAudioPlayer({ audioContextFactory: audio.factory })

    const first = track(player.play(AUDIO()))
    await flushAsync()
    const staleNode = audio.current?.sources.at(-1)

    player.stop()
    await flushAsync()
    const second = track(player.play(AUDIO()))
    await flushAsync()

    // A node detached during teardown must not be able to reach back in and
    // resolve whatever is playing now.
    staleNode?.finish()
    await flushAsync()

    expect(first.state).toBe("rejected")
    expect(second.state).toBe("pending")
  })
})

describe("createAudioPlayer - property: nothing is ever left pending", () => {
  type Op = "play" | "stop" | "finish" | "abort"

  const opArbitrary: fc.Arbitrary<Op> = fc.constantFrom(
    "play",
    "stop",
    "finish",
    "abort"
  )

  it("ends every sequence with an empty ledger and no unsettled caller", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArbitrary, { minLength: 1, maxLength: 12 }),
        async (ops) => {
          const audio = createFakeAudioContextHandle()
          const player = createAudioPlayer({
            audioContextFactory: audio.factory,
          })
          const settlements: Array<ReturnType<typeof track>> = []
          const controllers: Array<AbortController> = []

          const apply: Record<Op, () => void> = {
            play: () => {
              const controller = new AbortController()
              controllers.push(controller)
              settlements.push(
                track(player.play(AUDIO(), { signal: controller.signal }))
              )
            },
            stop: () => player.stop(),
            finish: () => audio.current?.finishCurrent(),
            abort: () => controllers.at(-1)?.abort(),
          }

          for (const op of ops) {
            apply[op]()
            await flushAsync(2)
          }

          // Whatever the sequence, disposal is the backstop: after it, no
          // caller anywhere is still waiting on this player.
          player.dispose()
          await flushAsync()

          expect(player.pending).toBe(0)
          for (const settlement of settlements) {
            expect(settlement.state).not.toBe("pending")
          }
        }
      ),
      { numRuns: 120 }
    )
  })
})
