/** @vitest-environment node */
import type { Playback, Player } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import type { HomeReading, Of, PhoneNote } from "@/lib/my-data/model"
import type { MyDataPorts } from "@/lib/my-data/runtime"
import { createMyData } from "@/lib/my-data/runtime"

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

const PHONE: ReadonlyArray<PhoneNote> = [
  {
    id: "a",
    of: "studio",
    at: "2026-11-01T09:00:00.000Z",
    bytes: 10,
    held: false,
    going: true,
  },
]

/** Ports whose home answers wait until the test answers them, in the order asked. */
function ports(): {
  ports: MyDataPorts
  home: Array<{ of: Of | null; answer: Deferred<HomeReading> }>
  played: Array<{ audio: Blob; ended: Deferred<void>; stopped: boolean }>
} {
  const home: Array<{ of: Of | null; answer: Deferred<HomeReading> }> = []
  const played: Array<{
    audio: Blob
    ended: Deferred<void>
    stopped: boolean
  }> = []
  const player: Player = {
    play(audio): Playback {
      const ended = deferred<void>()
      const entry = { audio, ended, stopped: false }
      played.push(entry)
      return {
        ended: ended.promise,
        stop: (): void => {
          entry.stopped = true
          ended.resolve()
        },
      }
    },
  }
  return {
    home,
    played,
    ports: {
      askHome: (of): Promise<HomeReading> => {
        const answer = deferred<HomeReading>()
        home.push({ of, answer })
        return answer.promise
      },
      readPhone: (): Promise<ReadonlyArray<PhoneNote>> =>
        Promise.resolve(PHONE),
      audioOf: (id): Promise<Blob | null> =>
        Promise.resolve(id === "gone" ? null : new Blob([id])),
      player,
    },
  }
}

describe("My data's runtime", () => {
  it("shows what was asked last: a late answer to an earlier read changes nothing", async () => {
    const { ports: p, home } = ports()
    const data = createMyData(p)
    data.open(null)
    data.open("studio")
    home[1]?.answer.resolve({ kind: "unpaired" })
    await flush()
    home[0]?.answer.resolve({ kind: "unreachable" })
    await flush()
    expect(data.getSnapshot()).toMatchObject({
      of: "studio",
      home: { kind: "unpaired" },
      phone: PHONE,
    })
  })

  it("keeps what it showed while a drag down reads again, and says when home didn't answer", async () => {
    const { ports: p, home } = ports()
    const data = createMyData(p)
    data.open(null)
    const read: HomeReading = {
      kind: "read",
      kept: { kinds: [], weeks: [], notes: null },
    }
    home[0]?.answer.resolve(read)
    await flush()
    const again = data.checkAgain()
    expect(data.getSnapshot().home).toEqual(read)
    home[1]?.answer.resolve({ kind: "unreachable" })
    await expect(again).rejects.toThrow()
    expect(data.getSnapshot().home).toEqual({ kind: "unreachable" })

    const unpaired = data.checkAgain()
    home[2]?.answer.resolve({ kind: "unpaired" })
    await expect(unpaired).resolves.toBeUndefined()
  })

  it("plays one recording at a time, and one that ends clears only itself", async () => {
    const { ports: p, played } = ports()
    const data = createMyData(p)
    data.play("a")
    await flush()
    expect(data.getSnapshot().playing).toBe("a")
    data.play("b")
    await flush()
    expect(played[0]?.stopped).toBe(true)
    expect(data.getSnapshot().playing).toBe("b")
    played[1]?.ended.resolve()
    await flush()
    expect(data.getSnapshot().playing).toBeNull()

    data.play("c")
    await flush()
    data.stop()
    expect(played[2]?.stopped).toBe(true)
    expect(data.getSnapshot().playing).toBeNull()
  })

  it("plays nothing for a recording whose audio is gone", async () => {
    const { ports: p, played } = ports()
    const data = createMyData(p)
    data.play("gone")
    await flush()
    expect(played).toEqual([])
    expect(data.getSnapshot().playing).toBeNull()
  })
})
