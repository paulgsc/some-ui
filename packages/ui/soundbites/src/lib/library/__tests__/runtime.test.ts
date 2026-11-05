/** @vitest-environment node */
import type { PatternTake, Playback, Player } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import type {
  LibraryPage,
  LibraryPhoneSnapshot,
  LibraryRead,
} from "@soundbites/lib/library/model"
import type { LibraryPhone, TakesHome } from "@soundbites/lib/library/runtime"
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
  it("wants only the answer to the read asked last, so a busy link is not asked again for an older one", () => {
    const asks: Array<{ q: string | null; wanted: () => boolean }> = []
    const home: TakesHome = {
      takes: (q, wanted) => {
        asks.push({ q, wanted })
        return new Promise(() => undefined)
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

  describe("with the phone's own takes with no scene", () => {
    const OWN: PatternTake = {
      id: "own-1",
      answers: "library",
      durationMs: 4000,
      recordedAt: "2026-11-05T09:00:00.000Z",
      standing: "current",
      kept: { place: "going" },
    }

    /** The phone's takes over the real pattern, their places as the test sets them. */
    function phoneTakes(): {
      phone: LibraryPhone
      sim: ReturnType<typeof simulatedPattern>
      move: (takes: ReadonlyArray<PatternTake>) => void
    } {
      const sim = simulatedPattern({
        options: {
          ...ONE_TAKE,
          takes: { per: "many", max: 40, full: "make-room" },
        },
        seed: [OWN],
      })
      let snapshot: LibraryPhoneSnapshot = { takes: [OWN], full: false }
      const listeners = new Set<() => void>()
      return {
        sim,
        phone: {
          pattern: sim.pattern,
          line: "library",
          getSnapshot: () => snapshot,
          subscribe(listener): () => void {
            listeners.add(listener)
            return (): void => {
              listeners.delete(listener)
            }
          },
        },
        move(takes): void {
          snapshot = { takes, full: false }
          for (const listener of listeners) listener()
        },
      }
    }

    it("reads the newest again once a take recorded here reaches home, and not for one already there", async () => {
      const takes = vi.fn<TakesHome["takes"]>(() =>
        Promise.resolve(page("newest", "t1"))
      )
      const { phone, move } = phoneTakes()
      const library = createTakeLibrary({
        home: { takes, audio: () => Promise.resolve(null) },
        player: player().player,
        phone,
      })
      library.attach()
      await settle()
      expect(takes).toHaveBeenCalledTimes(1)
      move([{ ...OWN, kept: { place: "home", since: null } }])
      await settle()
      expect(takes).toHaveBeenCalledTimes(2)
      expect(takes).toHaveBeenLastCalledWith(null, expect.any(Function))
      move([{ ...OWN, kept: { place: "home", since: "2026-11-05T09:01:00Z" } }])
      await settle()
      expect(takes).toHaveBeenCalledTimes(2)
    })

    it("plays one sound at a time, either way, and keeps a take under way when the screen goes", async () => {
      const { phone, sim } = phoneTakes()
      const stopPlaying = vi.spyOn(sim.pattern, "stopPlaying")
      const leave = vi.spyOn(sim.pattern, "leave")
      const played = player()
      const library = createTakeLibrary({
        home: {
          takes: () => Promise.resolve(page("newest", "t1")),
          audio: () => Promise.resolve(new Blob(["take"])),
        },
        player: played.player,
        phone,
      })
      const detach = library.attach()
      await settle()
      library.dispatch({ type: "play", id: "t1" })
      await settle()
      expect(library.getSnapshot().playback.kind).toBe("playing")
      // The phone plays one of its own: home's stops.
      sim.pattern.play(OWN.id)
      await settle()
      expect(played.stops).toEqual([0])
      expect(library.getSnapshot().playback).toEqual({ kind: "quiet" })
      expect(library.getSnapshot().phone).toBe("playing")
      // Home's Play stops the phone's, then plays home's.
      library.dispatch({ type: "play", id: "t1" })
      expect(stopPlaying).toHaveBeenCalled()
      await settle()
      expect(library.getSnapshot().phone).toBe("quiet")
      expect(library.getSnapshot().playback.kind).toBe("playing")
      detach()
      expect(leave).toHaveBeenCalledTimes(1)
    })
  })
})
