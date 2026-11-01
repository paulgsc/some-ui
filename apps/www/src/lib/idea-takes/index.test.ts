/** @vitest-environment node */
import type { BlobShelf, Playback } from "@some-ui/voice-capture"
import { microphoneOwner } from "@some-ui/voice-capture"
import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ideaTakesOf } from "@/lib/idea-takes"
import type { Take } from "@/lib/takes-desk"
import { createTakes } from "@/lib/takes-desk/runtime"

const NOW = Date.UTC(2026, 10, 1, 9)

/** A desk of idea takes over the simulated microphone, kept in memory. */
function desk(max = 40): {
  listed: Array<Take>
  mic: ReturnType<typeof simulatedMicrophone>
  takes: ReturnType<typeof ideaTakesOf>
} {
  const now = (): number => Date.now()
  const mic = simulatedMicrophone({ now })
  const listed: Array<Take> = []
  const audio: BlobShelf = {
    put: () => Promise.resolve(),
    get: () => Promise.resolve(new Blob(["v"])),
    remove: () => Promise.resolve(),
    ids: () => Promise.resolve([]),
  }
  let next = 0
  const phone = createTakes(
    {
      startRecording: mic.startRecording,
      audio,
      takes: {
        read: () => [...listed],
        add: (take): boolean => {
          listed.unshift(take)
          return true
        },
        remove: (): boolean => true,
      },
      saving: () => undefined,
      player: {
        play: (): Playback => ({
          ended: new Promise<void>(() => undefined),
          stop: () => undefined,
        }),
      },
      now,
      newId: () => `take-${++next}`,
      held: () => false,
      owner: microphoneOwner(),
    },
    { max, maxMs: 60_000 }
  )
  return { listed, mic, takes: ideaTakesOf(phone) }
}

/** One take of two seconds, stopped: the port's snapshot once it ended. */
async function take(
  takes: ReturnType<typeof ideaTakesOf>
): Promise<ReturnType<typeof takes.getSnapshot>> {
  const seen: Array<string> = []
  const stop = takes.subscribe(() => seen.push(takes.getSnapshot().take))
  takes.start("idea:i1:what")
  await vi.advanceTimersByTimeAsync(2_000)
  takes.stop()
  await vi.advanceTimersByTimeAsync(1_000)
  stop()
  return takes.getSnapshot()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("IH1: Studio's idea takes, on the phone's desk, as the take port", () => {
  it("records, keeps the take under what it answers, and names it once ended", async () => {
    vi.useFakeTimers({ now: NOW })
    const { listed, takes } = desk()
    expect(takes.getSnapshot()).toEqual({
      take: "idle",
      ended: null,
      full: false,
    })
    expect(await take(takes)).toEqual({
      take: "idle",
      ended: { seq: 1, ending: "kept", id: "take-1", reason: null },
      full: false,
    })
    expect(listed.map(({ id, line }) => [id, line])).toEqual([
      ["take-1", "idea:i1:what"],
    ])
  })

  it("says why the microphone refused", async () => {
    vi.useFakeTimers({ now: NOW })
    const { mic, takes } = desk()
    mic.script({ ...SPEAKING, open: { kind: "refuse", reason: "busy", ms: 0 } })
    expect((await take(takes)).ended).toEqual({
      seq: 1,
      ending: "blocked",
      id: null,
      reason: "busy",
    })
  })

  it("says it is full once the desk holds as many as it keeps and home holds none", async () => {
    vi.useFakeTimers({ now: NOW })
    const { takes } = desk(1)
    await take(takes)
    expect(takes.getSnapshot().full).toBe(true)
  })
})
