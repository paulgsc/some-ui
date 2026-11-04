/** @vitest-environment node */
import type { Playback, Player } from "@some-ui/voice-capture"
import type { LibraryPage, LibraryRead } from "@soundbites/lib/library/model"
import type { TakesHome } from "@soundbites/lib/library/runtime"
import { createTakeLibrary } from "@soundbites/lib/library/runtime"
import { describe, expect, it, vi } from "vitest"

/** A promise the test settles when it chooses. */
function later<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

const page = (by: LibraryPage["by"], id: string): LibraryRead => ({
  kind: "read",
  page: {
    takes: [
      {
        id,
        ref: "week-8:intro:1",
        recordedAt: "2026-11-03T09:00:00.000Z",
        storedAt: "2026-11-03T09:01:00.000Z",
        size: 48_000,
        setAsideAt: null,
        heard: null,
      },
    ],
    total: 3,
    matched: by === "newest" ? null : 1,
    by,
  },
})

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

/** A player whose playbacks the test ends, each stop counted. */
function player(): { player: Player; stops: Array<number>; end: () => void } {
  const stops: Array<number> = []
  let ending: (() => void) | null = null
  return {
    stops,
    end: () => ending?.(),
    player: {
      play(): Playback {
        const at = stops.length
        const ended = later<void>()
        ending = (): void => ended.settle()
        return {
          ended: ended.promise,
          stop: (): void => {
            stops.push(at)
            ended.settle()
          },
        }
      },
    },
  }
}

describe("Takes on home's runtime (ST32)", () => {
  it("keeps the newer search when an older, slower one lands after it, and stops asking a busy link for the older", async () => {
    const asks: Array<{
      q: string | null
      wanted: () => boolean
      answer: ReturnType<typeof later<LibraryRead>>
    }> = []
    const home: TakesHome = {
      takes: (q, wanted) => {
        const answer = later<LibraryRead>()
        asks.push({ q, wanted, answer })
        return answer.promise
      },
      audio: () => Promise.resolve(null),
    }
    const library = createTakeLibrary({ home, player: player().player })
    library.attach()
    library.dispatch({ type: "typed", text: "brand" })
    library.dispatch({ type: "search" })
    library.dispatch({ type: "typed", text: "outro" })
    library.dispatch({ type: "search" })
    expect(asks.map((ask) => ask.q)).toEqual([null, "brand", "outro"])
    expect(asks.map((ask) => ask.wanted())).toEqual([false, false, true])
    asks[2]!.answer.settle(page("words", "outro-take"))
    await settle()
    asks[1]!.answer.settle(page("words", "brand-take"))
    asks[0]!.answer.settle(page("newest", "newest-take"))
    await settle()
    const { read } = library.getSnapshot()
    expect(read.kind === "read" && read.page.takes[0]?.id).toBe("outro-take")
  })

  it("drops every answer once the screen is left, and stops what plays", async () => {
    const takes = later<LibraryRead>()
    const audio = later<Blob | null>()
    let wanted: () => boolean = () => true
    const home: TakesHome = {
      takes: (_q, still) => {
        wanted = still
        return takes.promise
      },
      audio: () => audio.promise,
    }
    const played = player()
    const library = createTakeLibrary({ home, player: played.player })
    const detach = library.attach()
    library.dispatch({ type: "play", id: "t1" })
    audio.settle(new Blob(["take"]))
    await settle()
    expect(library.getSnapshot().playback).toEqual({
      kind: "playing",
      id: "t1",
    })
    detach()
    expect(played.stops).toEqual([0])
    expect(wanted()).toBe(false)
    takes.settle(page("newest", "t1"))
    await settle()
    expect(library.getSnapshot().read).toEqual({ kind: "reading" })
  })

  it("plays a take's audio from home, and is quiet once it ends", async () => {
    const audio = vi.fn(() => Promise.resolve(new Blob(["take"])))
    const home: TakesHome = {
      takes: () => Promise.resolve(page("newest", "t1")),
      audio,
    }
    const played = player()
    const library = createTakeLibrary({ home, player: played.player })
    library.attach()
    await settle()
    expect(audio).not.toHaveBeenCalled()
    library.dispatch({ type: "play", id: "t1" })
    await settle()
    expect(audio).toHaveBeenCalledWith("t1")
    expect(library.getSnapshot().playback.kind).toBe("playing")
    played.end()
    await settle()
    expect(library.getSnapshot().playback).toEqual({ kind: "quiet" })
    expect(played.stops).toEqual([])
  })
})
