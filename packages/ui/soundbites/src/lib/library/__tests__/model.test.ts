/** @vitest-environment node */
import type { PatternTake, TakeKept } from "@some-ui/voice-capture"
import type {
  LibraryEvent,
  LibraryPage,
  LibraryState,
  LibraryStep,
} from "@soundbites/lib/library/model"
import {
  INITIAL_LIBRARY,
  notYetHome,
  reachedHome,
  SEARCH_MAX,
  stepLibrary,
  takeFor,
} from "@soundbites/lib/library/model"
import { describe, expect, it } from "vitest"

const PAGE: LibraryPage = {
  takes: [
    {
      id: "t1",
      ref: "week-8:intro:1",
      recordedAt: "2026-11-03T09:00:00.000Z",
      storedAt: "2026-11-03T09:01:00.000Z",
      size: 48_000,
      setAsideAt: null,
      heard: {
        text: "The brand comes first",
        language: "en",
        model: "ggml-base.en.bin",
        heardAt: "2026-11-03T09:02:00.000Z",
      },
    },
  ],
  total: 1,
  matched: null,
  by: "newest",
}

/** The events in order, from `state`. */
function run(
  events: ReadonlyArray<LibraryEvent>,
  state: LibraryState = INITIAL_LIBRARY
): LibraryStep {
  return events.reduce<LibraryStep>(
    (last, event) => {
      const next = stepLibrary(last.state, event)
      return { state: next.state, effects: next.effects }
    },
    { state, effects: [] }
  )
}

const AUDIO = new Blob(["take"], { type: "audio/webm" })

describe("Takes on home (ST32)", () => {
  it("reads the newest takes as the screen opens, and again on Try again", () => {
    const opened = run([{ type: "entered" }])
    expect(opened.state.read).toEqual({ kind: "reading" })
    expect(opened.effects).toEqual([{ type: "readTakes", seq: 1, q: null }])
    const away = run(
      [
        { type: "takesRead", seq: 1, read: { kind: "away" } },
        { type: "readAgain" },
      ],
      opened.state
    )
    expect(away.effects).toEqual([{ type: "readTakes", seq: 2, q: null }])
  })

  it("searches the words typed, trimmed, and reads nothing on typing alone", () => {
    const typed = run([
      { type: "entered" },
      { type: "typed", text: "  brand intro " },
    ])
    expect(typed.effects).toEqual([])
    const searched = stepLibrary(typed.state, { type: "search" })
    expect(searched.effects).toEqual([
      { type: "readTakes", seq: 2, q: "brand intro" },
    ])
    expect(searched.state.asked).toBe("brand intro")
  })

  it("answers only the read asked last: a slow search overtaken by a newer one changes nothing", () => {
    const two = run([
      { type: "entered" },
      { type: "typed", text: "brand" },
      { type: "search" },
      { type: "typed", text: "outro" },
      { type: "search" },
    ])
    expect(two.state.seq).toBe(3)
    // The newer search lands first, then the older, slower one.
    const outro: LibraryPage = { ...PAGE, by: "words", matched: 1 }
    const landed = run(
      [
        { type: "takesRead", seq: 3, read: { kind: "read", page: outro } },
        { type: "takesRead", seq: 2, read: { kind: "read", page: PAGE } },
        { type: "takesRead", seq: 1, read: { kind: "away" } },
      ],
      two.state
    )
    expect(landed.state.read).toEqual({ kind: "read", page: outro })
    expect(landed.state.asked).toBe("outro")
  })

  it("never asks a search home would refuse: blank shows the newest, too long says so", () => {
    const blank = run([
      { type: "entered" },
      { type: "typed", text: "   " },
      { type: "search" },
    ])
    expect(blank.effects).toEqual([{ type: "readTakes", seq: 2, q: null }])
    const long = run(
      [{ type: "typed", text: "a".repeat(SEARCH_MAX + 1) }, { type: "search" }],
      blank.state
    )
    expect(long.effects).toEqual([])
    expect(long.state.tooLong).toBe(true)
    const fits = run(
      [{ type: "typed", text: "a".repeat(SEARCH_MAX) }, { type: "search" }],
      long.state
    )
    expect(fits.effects).toEqual([
      { type: "readTakes", seq: 3, q: "a".repeat(SEARCH_MAX) },
    ])
    expect(fits.state.tooLong).toBe(false)
  })

  it("goes back to the newest, clearing the search", () => {
    const back = run([
      { type: "entered" },
      { type: "typed", text: "brand" },
      { type: "search" },
      { type: "newest" },
    ])
    expect(back.state.asked).toBeNull()
    expect(back.state.draft).toBe("")
    expect(back.effects).toEqual([{ type: "readTakes", seq: 3, q: null }])
  })

  it("plays one take at a time, from home, and asks for audio only on a Play", () => {
    const opened = run([
      { type: "entered" },
      { type: "takesRead", seq: 1, read: { kind: "read", page: PAGE } },
    ])
    expect(opened.effects).toEqual([])
    const asked = stepLibrary(opened.state, { type: "play", id: "t1" })
    expect(asked.effects).toEqual([{ type: "readAudio", play: 1, id: "t1" }])
    expect(asked.state.playback).toEqual({ kind: "loading", id: "t1" })
    const playing = stepLibrary(asked.state, {
      type: "audioRead",
      play: 1,
      audio: AUDIO,
    })
    expect(playing.effects).toEqual([
      { type: "startPlayback", play: 1, audio: AUDIO },
    ])
    // Another take stops this one first, and the late end of it is for nobody.
    const other = stepLibrary(playing.state, { type: "play", id: "t2" })
    expect(other.effects).toEqual([
      { type: "stopPlayback" },
      { type: "readAudio", play: 3, id: "t2" },
    ])
    const ended = stepLibrary(other.state, { type: "playEnded", play: 1 })
    expect(ended.state.playback).toEqual({ kind: "loading", id: "t2" })
  })

  it("never plays audio that lands for a play since overtaken, and stops on a second press", () => {
    const loading = run([
      { type: "entered" },
      { type: "play", id: "t1" },
      { type: "play", id: "t1" },
    ])
    expect(loading.state.playback).toEqual({ kind: "quiet" })
    expect(loading.effects).toEqual([{ type: "stopPlayback" }])
    const late = stepLibrary(loading.state, {
      type: "audioRead",
      play: 1,
      audio: AUDIO,
    })
    expect(late.effects).toEqual([])
  })

  it("stops what plays, or is on its way, when a search replaces the list its Stop is on", () => {
    const playing = run([
      { type: "entered" },
      { type: "takesRead", seq: 1, read: { kind: "read", page: PAGE } },
      { type: "play", id: "t1" },
      { type: "audioRead", play: 1, audio: AUDIO },
      { type: "typed", text: "intro" },
    ])
    const searched = stepLibrary(playing.state, { type: "search" })
    expect(searched.effects).toEqual([
      { type: "stopPlayback" },
      { type: "readTakes", seq: 2, q: "intro" },
    ])
    expect(searched.state.playback).toEqual({ kind: "quiet" })
    const loading = run(
      [{ type: "play", id: "t1" }, { type: "newest" }],
      searched.state
    )
    expect(loading.effects).toEqual([
      { type: "stopPlayback" },
      { type: "readTakes", seq: 3, q: null },
    ])
    const late = stepLibrary(loading.state, {
      type: "audioRead",
      play: 3,
      audio: AUDIO,
    })
    expect(late.effects).toEqual([])
  })

  it("says a take home couldn't give back, and stops playing as the screen is left", () => {
    const none = run([
      { type: "entered" },
      { type: "play", id: "t1" },
      { type: "audioRead", play: 1, audio: null },
    ])
    expect(none.state.playback).toEqual({ kind: "quiet" })
    expect(none.state.unplayable).toBe("t1")
    const left = run(
      [
        { type: "play", id: "t1" },
        { type: "audioRead", play: 2, audio: AUDIO },
        { type: "left" },
      ],
      none.state
    )
    expect(left.state.unplayable).toBeNull()
    expect(left.effects).toEqual([{ type: "stopPlayback" }])
  })

  it("names what a take is for by the ref it went home with", () => {
    expect(takeFor("week-8:intro:1")).toBe("scene")
    expect(takeFor("idea:i1:what")).toBe("idea")
    expect(takeFor("something else")).toBe("other")
  })

  describe("the phone's own takes with no scene", () => {
    const take = (id: string, kept: TakeKept | null): PatternTake => ({
      id,
      answers: "library",
      durationMs: 4000,
      recordedAt: "2026-11-05T09:00:00.000Z",
      standing: "current",
      kept,
    })
    const ON_HOME: TakeKept = { place: "home", since: null }

    it("lists apart only those home doesn't hold yet, and notices one reaching home", () => {
      const takes = [
        take("a", { place: "phone" }),
        take("b", { place: "going" }),
        take("c", ON_HOME),
        take("d", null),
      ]
      expect(notYetHome(takes, null).map(({ id }) => id)).toEqual([
        "a",
        "b",
        "d",
      ])
      // One playing as it reaches home stays, with its Stop, until it stops.
      expect(notYetHome(takes, "c").map(({ id }) => id)).toEqual([
        "a",
        "b",
        "c",
        "d",
      ])
      const first = reachedHome(new Set(), takes)
      expect([...first.held]).toEqual(["c"])
      expect(first.arrived).toBe(true)
      expect(reachedHome(first.held, takes).arrived).toBe(false)
      const later = reachedHome(first.held, [take("b", ON_HOME), ...takes])
      expect(later.arrived).toBe(true)
      // One home no longer lists as held (deleted, say) is no arrival.
      expect(
        reachedHome(first.held, [take("a", { place: "phone" })]).arrived
      ).toBe(false)
    })

    it("reads the newest again once a take reaches home, waiting for what plays to end", () => {
      const read = run([
        { type: "entered" },
        { type: "takesRead", seq: 1, read: { kind: "read", page: PAGE } },
      ])
      const now = stepLibrary(read.state, { type: "arrived" })
      expect(now.effects).toEqual([{ type: "readTakes", seq: 2, q: null }])
      expect(now.state.behind).toBe(false)

      const playing = run(
        [
          { type: "play", id: "t1" },
          { type: "audioRead", play: 1, audio: AUDIO },
          { type: "arrived" },
        ],
        read.state
      )
      expect(playing.effects).toEqual([])
      expect(playing.state.behind).toBe(true)
      const ended = stepLibrary(playing.state, { type: "playEnded", play: 1 })
      expect(ended.effects).toEqual([{ type: "readTakes", seq: 2, q: null }])
      expect(ended.state.behind).toBe(false)
    })

    it("leaves a search shown as it is when a take reaches home", () => {
      const searched = run([
        { type: "entered" },
        { type: "typed", text: "brand" },
        { type: "search" },
        { type: "arrived" },
      ])
      expect(searched.effects).toEqual([])
      expect(searched.state.asked).toBe("brand")
      expect(searched.state.behind).toBe(false)
    })

    it("plays one sound at a time: the phone's sound stops home's, and Play waits only while it records", () => {
      const playing = run([
        { type: "entered" },
        { type: "takesRead", seq: 1, read: { kind: "read", page: PAGE } },
        { type: "play", id: "t1" },
        { type: "audioRead", play: 1, audio: AUDIO },
      ])
      const recording = stepLibrary(playing.state, {
        type: "phone",
        sound: "recording",
      })
      expect(recording.effects).toEqual([{ type: "stopPlayback" }])
      expect(recording.state.playback).toEqual({ kind: "quiet" })
      const refused = stepLibrary(recording.state, { type: "play", id: "t1" })
      expect(refused.effects).toEqual([])
      expect(refused.state.playback).toEqual({ kind: "quiet" })
      // While the phone only plays, home's Play is taken: the runtime stops
      // the phone's playback as it reads home's audio.
      const phonePlays = stepLibrary(refused.state, {
        type: "phone",
        sound: "playing",
      })
      const again = stepLibrary(phonePlays.state, { type: "play", id: "t1" })
      expect(again.effects).toEqual([
        { type: "readAudio", play: again.state.plays, id: "t1" },
      ])
    })
  })
})
