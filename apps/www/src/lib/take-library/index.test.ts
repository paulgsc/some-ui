/**
 * @vitest-environment node
 *
 * Home, as Takes on home reads it (ST32): each answer of
 * `GET /voice-notes/takes` said in the screen's terms, a busy link asked
 * again only while the read is still wanted.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { TAKE_OFS } from "@some-ui/soundbites/contract"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneBite } from "@/lib/game-bites"
import type { TakesAsked } from "@/lib/home-link/takes-read"
import type { OnPhone } from "@/lib/home-link/voice-copy"
import { takesHome } from "@/lib/take-library"
import { phoneTakesOf, readTakes } from "@/lib/take-library/model"
import { VOICE_OFS } from "@/lib/voice-home/model"

const asked = vi.hoisted(
  (): {
    answers: Array<TakesAsked>
    asks: Array<string | null>
    afters: Array<string | null>
  } => ({ answers: [], asks: [], afters: [] })
)

vi.mock("@/lib/home-link/takes-read", () => ({
  askTakes: (q: string | null, after: string | null): Promise<TakesAsked> => {
    asked.asks.push(q)
    asked.afters.push(after)
    return Promise.resolve(asked.answers.shift() ?? { kind: "unreachable" })
  },
}))

// The phone's own takes are read by `phoneOnlyTakes`, not here.
vi.mock("@/lib/home-link/voice-copy", () => ({}))
vi.mock("@/lib/game-bites", () => ({}))

vi.mock("@/lib/home-link/voice-audio", () => ({
  askAudio: (): Promise<Blob | null> => Promise.resolve(null),
}))

const reply = (status: number, body: unknown = ""): HomeAnswer => ({
  status,
  body: typeof body === "string" ? body : JSON.stringify(body),
})

const answered = (status: number, body: unknown = ""): TakesAsked => ({
  kind: "answered",
  answer: reply(status, body),
})

const TAKES = {
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
    {
      id: "t2",
      ref: "idea:i1:what",
      recordedAt: "2026-11-02T09:00:00.000Z",
      storedAt: "2026-11-02T09:01:00.000Z",
      size: 12_000,
      setAsideAt: "2026-11-04T10:00:00.000Z",
      heard: null,
    },
  ],
  total: 2,
  matched: null,
  by: "newest",
}

const always = (): boolean => true

beforeEach(() => {
  asked.answers = []
  asked.asks = []
  asked.afters = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Takes on home's reads of home (ST32)", () => {
  it("reads the takes, a search by words, and one home will search by meaning", () => {
    const read = readTakes(reply(200, TAKES))
    expect(read.kind === "read" && read.page.takes.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ])
    expect(read.kind === "read" && read.page.takes[1]?.heard).toBeNull()
    const words = readTakes(reply(200, { ...TAKES, by: "words", matched: 7 }))
    expect(words.kind === "read" && words.page.matched).toBe(7)
    const meaning = readTakes(
      reply(200, { ...TAKES, by: "meaning", matched: 2 })
    )
    expect(meaning.kind === "read" && meaning.page.by).toBe("meaning")
  })

  it("reads where each take is on the conveyor, and none from a home before it (CONVEYOR1)", () => {
    const [moved, before] = TAKES.takes
    const read = readTakes(
      reply(200, {
        ...TAKES,
        takes: [
          {
            ...moved,
            station: "ready-for-pickup",
            stationAt: "2026-11-05T10:00:00Z",
          },
          { ...before, station: "somewhere new", stationAt: 3 },
        ],
      })
    )
    const takes = read.kind === "read" ? read.page.takes : []
    expect(takes[0]).toMatchObject({
      station: "ready-for-pickup",
      stationAt: "2026-11-05T10:00:00Z",
    })
    expect(takes[1]?.station).toBeUndefined()
    expect(takes[1]?.stationAt).toBeUndefined()
    // An idea's answer is on no conveyor: home says so with null.
    const idea = readTakes(
      reply(200, {
        ...TAKES,
        takes: [{ ...before, station: null, stationAt: null }],
      })
    )
    expect(idea.kind === "read" && idea.page.takes[0]?.station).toBeNull()
    const older = readTakes(reply(200, TAKES))
    expect(older.kind === "read" && older.page.takes[0]?.station).toBe(
      undefined
    )
  })

  it("says a home without the route keeps no list yet, and an answer it can't read", () => {
    expect(readTakes(reply(404))).toEqual({ kind: "older" })
    expect(readTakes(reply(422))).toEqual({ kind: "unreadable" })
    expect(readTakes(reply(200, "{"))).toEqual({
      kind: "unreadable",
    })
    expect(readTakes(reply(200, { ...TAKES, by: "guess" }))).toEqual({
      kind: "unreadable",
    })
  })

  it("asks once, passing the search, and says an unpaired phone or no answer", async () => {
    asked.answers = [answered(200, TAKES)]
    const read = await takesHome.takes("brand", always)
    expect(read.kind).toBe("read")
    expect(asked.asks).toEqual(["brand"])
    await takesHome.takes(
      null,
      always,
      "2026-11-03T09:00:00.000Z|2026-11-03T09:01:00.000Z|t1"
    )
    expect(asked.afters.at(-1)).toBe(
      "2026-11-03T09:00:00.000Z|2026-11-03T09:01:00.000Z|t1"
    )
    asked.answers = [{ kind: "unpaired" }]
    expect(await takesHome.takes(null, always)).toEqual({ kind: "unpaired" })
    asked.answers = [{ kind: "unreachable" }]
    expect(await takesHome.takes(null, always)).toEqual({ kind: "away" })
  })

  it("asks a busy link again a second later, at most ten times, then says busy, and not once the read is no longer wanted", async () => {
    vi.useFakeTimers()
    asked.answers = [{ kind: "busy" }, answered(200, TAKES)]
    const twice = takesHome.takes(null, always)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await twice).kind).toBe("read")
    expect(asked.asks).toEqual([null, null])

    asked.asks = []
    asked.answers = Array.from({ length: 12 }, () => ({ kind: "busy" }))
    const busy = takesHome.takes(null, always)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await busy).toEqual({ kind: "busy" })
    expect(asked.asks).toHaveLength(10)

    asked.asks = []
    let wanted = true
    asked.answers = Array.from({ length: 12 }, () => ({ kind: "busy" }))
    const stale = takesHome.takes("brand", () => wanted)
    await vi.advanceTimersByTimeAsync(1_000)
    wanted = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await stale).toEqual({ kind: "busy" })
    expect(asked.asks).toEqual(["brand", "brand"])
  })
})

describe("one home for every take", () => {
  // The check: a kind of voice note home takes (`VOICE_OFS`, home's
  // `voice_repo::Of`) that Takes has no compartment or about port for
  // fails here, so a take can't go somewhere Takes doesn't show.
  it("covers every kind of take the phone sends home, in home's order", () => {
    expect([...TAKE_OFS]).toEqual([...VOICE_OFS])
  })

  it("reads each take's kind, how home keeps it and home's name for a game, and where the next page starts (epoch 19)", () => {
    const [studio] = TAKES.takes
    const read = readTakes(
      reply(200, {
        ...TAKES,
        next: "2026-11-03T09:00:00.000Z|2026-11-03T09:01:00.000Z|t1",
        takes: [
          { ...studio, kind: "studio", status: "kept" },
          {
            ...studio,
            id: "b1",
            kind: "game",
            ref: "401772",
            status: "kept",
            about: {
              key: "game:401772",
              game: "401772",
              label: "NE @ CHI",
              bite: {
                scenario: "fourth-down",
                how: "offered",
                strip: "Q3 4:12",
                started: "2026-11-16T21:00:00Z",
              },
              match: null,
            },
          },
          // The narrower read: the game and its match, no bite.
          {
            ...studio,
            id: "b2",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: null,
              bite: null,
            },
          },
          // Matched to its play (GWB14): its quarter and clock, never its words.
          {
            ...studio,
            id: "b3",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: "NE @ CHI",
              bite: null,
              match: {
                method: "next",
                scenario: "fourth-down",
                gapSeconds: -12,
                play: {
                  id: "4017721",
                  period: 3,
                  clock: "4:05",
                  type: "Rush",
                  text: "J.Smith up the middle for 2 yards",
                },
              },
            },
          },
          // Matched to a play home no longer lists; a quarter it can't read
          // leaves the clock.
          {
            ...studio,
            id: "b6",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: null,
              bite: null,
              match: { method: "nearest", play: null },
            },
          },
          {
            ...studio,
            id: "b7",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: null,
              bite: null,
              match: { method: "nearest", play: { period: 0, clock: "1:10" } },
            },
          },
          // A method this phone doesn't know yet.
          {
            ...studio,
            id: "b5",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: null,
              bite: null,
              match: { method: "guessed", play: { period: 2, clock: "0:30" } },
            },
          },
          // Looked for and none found; a play home can't read is no play.
          {
            ...studio,
            id: "b4",
            kind: "game",
            ref: "401772",
            about: {
              key: "game:401772",
              game: "401772",
              label: null,
              bite: null,
              match: { method: "unmatched", play: { period: "third" } },
            },
          },
          {
            ...studio,
            id: "d1",
            kind: "dream",
            ref: null,
            heard: null,
            status: "deleted",
            about: null,
          },
        ],
      })
    )
    const page = read.kind === "read" ? read.page : null
    expect(page?.covers).toBe("every")
    expect(page?.next).toBe(
      "2026-11-03T09:00:00.000Z|2026-11-03T09:01:00.000Z|t1"
    )
    expect(page?.takes.map(({ of }) => of)).toEqual([
      "studio",
      "game",
      "game",
      "game",
      "game",
      "game",
      "game",
      "game",
      "unknown",
    ])
    expect(page?.takes[1]?.fields).toEqual({
      label: "NE @ CHI",
      scenario: "fourth-down",
      strip: "Q3 4:12",
      started: "2026-11-16T21:00:00Z",
    })
    expect(page?.takes[2]?.fields).toEqual({})
    expect(page?.takes[3]?.fields).toEqual({
      label: "NE @ CHI",
      matchedBy: "next",
      playPeriod: "3",
      playClock: "4:05",
    })
    expect(page?.takes[4]?.fields).toEqual({ matchedBy: "nearest" })
    expect(page?.takes[5]?.fields).toEqual({
      matchedBy: "nearest",
      playClock: "1:10",
    })
    // A method this phone doesn't know reads as not matched yet, its play
    // with it.
    expect(page?.takes[6]?.fields).toEqual({})
    expect(page?.takes[7]?.fields).toEqual({ matchedBy: "unmatched" })
    // A deleted take keeps no ref; it still shows, as deleted.
    expect(page?.takes[8]).toMatchObject({ ref: "", status: "deleted" })
  })

  it("says a home that lists Studio's alone, as a home before epoch 19 answers", () => {
    const older = readTakes(reply(200, TAKES))
    expect(older.kind === "read" && older.page.covers).toBe("studio")
    const last = readTakes(
      reply(200, { ...TAKES, takes: [], total: 0, next: null })
    )
    expect(last.kind === "read" && last.page.covers).toBe("every")
  })

  it("lists the phone's takes of every kind, the bites home holds whose audio left from home, and a bite held back for Undo from here", async () => {
    const audio = (): Promise<Blob | null> => Promise.resolve(null)
    const notes: ReadonlyArray<OnPhone> = [
      {
        id: "r1",
        of: "rust-round",
        ref: "2026-w46:QM-311",
        at: "2026-11-10T09:00:00Z",
        audio,
      },
      {
        id: "b1",
        of: "game",
        ref: "401772",
        fields: { strip: "Q3 4:12" },
        at: "2026-11-16T21:00:00Z",
        audio,
      },
    ]
    const bite = (id: string, homeSince?: number): PhoneBite => ({
      id,
      gameId: "401772",
      at: "2026-11-16T20:00:00Z",
      contentType: "audio/webm",
      durationMs: 4_000,
      fields: { strip: "Q2 1:00" },
      holdUntil: 0,
      ...(homeSince === undefined ? {} : { homeSince }),
    })
    const fromHome: Array<string> = []
    const fromHere: Array<string> = []
    const takes = phoneTakesOf(
      notes,
      // b3 is still held back for Undo: not listed to go, not on home.
      [bite("b1"), bite("b2", 1), bite("b3")],
      (id) => id === "r1",
      {
        bite: (id) => {
          fromHere.push(id)
          return Promise.resolve(null)
        },
        home: (id) => {
          fromHome.push(id)
          return Promise.resolve(null)
        },
      }
    )
    expect(takes.map(({ id, of, home }) => [id, of, home])).toEqual([
      ["r1", "rust-round", true],
      ["b1", "game", false],
      ["b2", "game", true],
      ["b3", "game", false],
    ])
    expect(takes[2]?.fields).toEqual({ strip: "Q2 1:00" })
    await takes[2]?.audio()
    await takes[3]?.audio()
    expect(fromHome).toEqual(["b2"])
    expect(fromHere).toEqual(["b3"])
    // r1 is on home and its audio left this phone: it plays from home.
    await takes[0]?.audio()
    expect(fromHome).toEqual(["b2", "r1"])
  })
})
