import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hostAt, type Beat } from "@some-ui/styles/brand/host"
import {
  hearsOf,
  latestVersion,
  parseConversationRecord,
  type PodcastVersion,
  type TimedTurn,
} from "@video-render/conversation"
import { describe, expect, it } from "vitest"

/** The #3573 sample record, lifted from /1: Tin Bird asks, Mochi answers from a take, Tin Bird sums up. */
const SAMPLE: PodcastVersion = (() => {
  const parsed = parseConversationRecord(
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, "../sample/conversation/v1-week-12.json"),
        "utf8"
      )
    )
  )
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"))
  const version = latestVersion(parsed.value.state)
  if (version === null) throw new Error("the sample has no version")
  return version
})()

/** Each turn's words laid end to end from `fromMs`, `perWordMs` apart, with `gapMs` between turns. */
function timedFrom(
  version: PodcastVersion,
  fromMs = 0,
  perWordMs = 300,
  gapMs = 900
): ReadonlyArray<TimedTurn> {
  let t = fromMs
  return version.turns.map((turn) => {
    const n = turn.voice === "kokoro" ? turn.said.split(/\s+/).length : 12
    const words = Array.from({ length: n }, (_, k) => ({
      text: `w${String(k)}`,
      startMs: t + k * perWordMs,
      endMs: t + k * perWordMs + perWordMs - 60,
    }))
    t += n * perWordMs + gapMs
    return { turn: turn.id, words }
  })
}

describe("hearsOf: what a listener hears of a version (#3580)", () => {
  const timed = timedFrom(SAMPLE)
  const wordsOf = (
    turn: string
  ): ReadonlyArray<{ startMs: number; endMs: number }> =>
    (timed.find((t) => t.turn === turn)?.words ?? []).map(
      ({ startMs, endMs }) => ({ startMs, endMs })
    )
  const ownerTurns = SAMPLE.turns
    .filter((t) => t.voice === "owner")
    .map((t) => t.id)
  const kokoroTurns = SAMPLE.turns
    .filter((t) => t.voice === "kokoro")
    .map((t) => t.id)

  it("gives Mochi every word Tin Bird says, and none of its own", () => {
    expect(hearsOf(SAMPLE, timed, "mochi")).toEqual(
      kokoroTurns.flatMap(wordsOf)
    )
  })

  it("gives Tin Bird every word Mochi says, and none of its own", () => {
    expect(hearsOf(SAMPLE, timed, "tin-owlet")).toEqual(
      ownerTurns.flatMap(wordsOf)
    )
  })

  it("counts a character's speakers in other roles as itself", () => {
    const tin = SAMPLE.speakers.find((s) => s.character === "tin-owlet")
    if (tin === undefined) throw new Error("the sample has no Tin Bird")
    const skeptic = { ...tin, id: "skeptic" }
    const first = SAMPLE.turns[0]
    if (first?.voice !== "kokoro")
      throw new Error("the sample opens with Tin Bird")
    const version: PodcastVersion = {
      ...SAMPLE,
      speakers: [...SAMPLE.speakers, skeptic],
      turns: [...SAMPLE.turns, { ...first, id: "k9", speaker: "skeptic" }],
    }
    const heard = hearsOf(version, timedFrom(version), "tin-owlet")
    expect(heard).toEqual(hearsOf(SAMPLE, timed, "tin-owlet"))
  })

  it("hears no turn the version doesn't have, and keeps what it hears in order", () => {
    const stray: TimedTurn = {
      turn: "nope",
      words: [{ text: "x", startMs: 5, endMs: 9 }],
    }
    const heard = hearsOf(SAMPLE, [...[...timed].reverse(), stray], "mochi")
    expect(heard).toEqual(hearsOf(SAMPLE, timed, "mochi"))
  })

  it("keeps a Mochi listener from playing while Tin Bird talks, drawn by the rig", () => {
    const hears = hearsOf(SAMPLE, timed, "mochi")
    const listener: Beat = {
      atMs: 0,
      character: "mochi",
      emotion: "curious",
      shot: "medium",
      placement: "bottom-left",
      speaking: false,
      hears,
    }
    const end = hears.at(-1)?.endMs ?? 0
    for (let t = 0; t < end; t += 40) {
      const play = hostAt([listener], 3, t, {
        x: 0,
        y: 0,
        width: 1728,
        height: 614,
      })?.live.play
      if (play != null)
        expect(
          hears.some((w) => w.startMs <= t && t < w.endMs),
          String(t)
        ).toBe(false)
    }
  })
})
