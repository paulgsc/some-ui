/**
 * @vitest-environment node
 *
 * Home, as Takes on home reads it (ST32): each answer of
 * `GET /voice-notes/takes` said in the screen's terms, a busy link asked
 * again only while the read is still wanted, and Play's audio from home.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TakesAsked } from "@/lib/home-link/takes-read"
import { takesHome } from "@/lib/take-library"
import { readTakes } from "@/lib/take-library/model"

const asked = vi.hoisted(
  (): {
    answers: Array<TakesAsked>
    asks: Array<string | null>
    audio: Array<string>
  } => ({ answers: [], asks: [], audio: [] })
)

vi.mock("@/lib/home-link/takes-read", () => ({
  askTakes: (q: string | null): Promise<TakesAsked> => {
    asked.asks.push(q)
    return Promise.resolve(asked.answers.shift() ?? { kind: "unreachable" })
  },
}))

vi.mock("@/lib/home-link/voice-audio", () => ({
  askAudio: (id: string): Promise<Blob | null> => {
    asked.audio.push(id)
    return Promise.resolve(id === "t1" ? new Blob(["take"]) : null)
  },
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
  asked.audio = []
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
    asked.answers = [{ kind: "unpaired" }]
    expect(await takesHome.takes(null, always)).toEqual({ kind: "unpaired" })
    asked.answers = [{ kind: "unreachable" }]
    expect(await takesHome.takes(null, always)).toEqual({ kind: "away" })
  })

  it("asks a busy link again a second later, at most ten times, and not once the read is no longer wanted", async () => {
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
    expect(await busy).toEqual({ kind: "away" })
    expect(asked.asks).toHaveLength(10)

    asked.asks = []
    let wanted = true
    asked.answers = Array.from({ length: 12 }, () => ({ kind: "busy" }))
    const stale = takesHome.takes("brand", () => wanted)
    await vi.advanceTimersByTimeAsync(1_000)
    wanted = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await stale).toEqual({ kind: "away" })
    expect(asked.asks).toEqual(["brand", "brand"])
  })

  it("plays a take's audio from home, one ask per play", async () => {
    expect(await takesHome.audio("t1")).toBeInstanceOf(Blob)
    expect(await takesHome.audio("gone")).toBeNull()
    expect(asked.audio).toEqual(["t1", "gone"])
  })
})
