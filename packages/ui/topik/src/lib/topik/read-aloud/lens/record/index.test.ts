import type { LensItem } from "@topik/lib/topik/read-aloud/lens/items"
import type { LensOutcome } from "@topik/lib/topik/read-aloud/lens/machine"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import {
  racing,
  recordEntry,
  rushFloorMs,
} from "@topik/lib/topik/read-aloud/lens/record"
import { describe, expect, it } from "vitest"

/** 학교에 가요 (five syllables) after a three-syllable cue, at level one. */
const ITEM: LensItem = {
  key: "l:school",
  lineId: "school",
  level: 1,
  cue: { korean: "뭐 해요?", segments: [], decides: [], modality: "both" },
  korean: "학교에 가요.",
  segments: [],
  words: ["학교에", "가요"],
  decides: [1],
  shape: {
    kind: "pick",
    word: 0,
    prefix: "학교",
    candidates: [
      { surface: "학교에서", label: "에서", mistake: "eseo-for-e" },
      { surface: "학교에", label: "에" },
    ],
  },
  probes: [{ rung: 1, kind: "verb", answer: 1 }],
  situations: { options: ["a", "b", "c"], intended: 2 },
}

const OUTCOME: LensOutcome = {
  answer: { kind: "pick", candidate: 0 },
  right: false,
  expired: false,
  chosen: "eseo-for-e",
  probes: [{ rung: 1, answer: "1", right: true }],
  stepDown: "right",
  floor: 1,
  situation: null,
  shownAt: 1_000,
  answeredAt: 1_500,
  pausedMs: 0,
}

const entry = (
  overrides: Partial<LensOutcome>,
  {
    audio = true,
    earlier = [],
    item = ITEM,
  }: {
    audio?: boolean
    earlier?: Array<LensRecordEntry>
    item?: LensItem
  } = {}
): LensRecordEntry =>
  recordEntry(
    item,
    { ...OUTCOME, ...overrides },
    {
      session: "s",
      closedAt: Date.UTC(2026, 9, 17),
      audio,
      earlier,
      take: { count: 2, lastMs: 3100, heardFirst: false },
    }
  )

describe("recordEntry", () => {
  it("writes what was shown, answered and chosen, and when it closed", () => {
    expect(entry({})).toEqual({
      session: "s",
      line: "school",
      shownAt: "1970-01-01T00:00:01.000Z",
      closedAt: "2026-10-17T00:00:00.000Z",
      cue: "both",
      shape: "pick",
      answer: "학교에서",
      right: false,
      expired: false,
      shown: ["eseo-for-e"],
      chosen: "eseo-for-e",
      answerMs: 500,
      rushed: true,
      racing: false,
      stepDown: {
        asked: [
          { rung: 1, kind: "verb", word: null, answer: "가요", right: true },
        ],
        end: "right",
        floor: 1,
      },
      situation: null,
      take: { count: 2, lastMs: 3100, heardFirst: false },
    })
  })

  it("writes a judge's tapped word as it was shown, and a split as cut", () => {
    const judge: LensItem = {
      ...ITEM,
      shape: {
        kind: "judge",
        misform: { word: 0, surface: "학교에서", mistake: "eseo-for-e" },
      },
      probes: [{ rung: 2, kind: "split", word: "가요", cuts: [1], answer: 1 }],
    }
    expect(
      entry(
        {
          // Recorded whatever the grade: here a miss, so the step-down shows.
          answer: { kind: "word", word: 0 },
          right: false,
          probes: [{ rung: 2, answer: "1", right: true }],
        },
        { item: judge }
      )
    ).toMatchObject({
      answer: "학교에서",
      stepDown: { asked: [{ kind: "split", word: "가요", answer: "가|요" }] },
    })
  })

  it("says a step-down was left when the item closed during it", () => {
    expect(entry({ stepDown: null, floor: null, probes: [] }).stepDown).toEqual(
      { asked: [], end: "left", floor: null }
    )
  })

  it("leaves an item's pauses out of its time to answer", () => {
    expect(entry({ answeredAt: 9_000, pausedMs: 7_900 }).answerMs).toBe(100)
  })

  it("marks the session racing from the third of five rushed, and keeps it so", () => {
    const rushed = entry({})
    expect(entry({}, { earlier: [rushed] }).racing).toBe(false)
    expect(entry({}, { earlier: [rushed, rushed] }).racing).toBe(true)
    const slow = entry(
      { answeredAt: 9_000 },
      { earlier: [{ ...rushed, racing: true }] }
    )
    expect(slow.racing).toBe(true)
  })

  it("times rushing by the line, and the cue when it was read (Rem. 4.17)", () => {
    // Syllables at twice level one's 1.5 a second: eight with the cue, five without.
    expect(rushFloorMs(ITEM, true)).toBeCloseTo(2666.67, 1)
    expect(rushFloorMs(ITEM, false)).toBeCloseTo(1666.67, 1)
    expect(entry({ answeredAt: 4_000 }).rushed).toBe(false)
  })

  it("reads the cue where nothing can speak, and keeps no time for an expiry", () => {
    expect(entry({}, { audio: false }).cue).toBe("glyph")
    expect(entry({ expired: true, answer: null })).toMatchObject({
      answer: null,
      answerMs: null,
      rushed: null,
    })
  })

  it("names the situation chosen and whether it was the author's", () => {
    expect(entry({ situation: { chosen: 2 } }).situation).toEqual({
      chosen: "c",
      intended: true,
    })
    expect(entry({ situation: { chosen: null } }).situation).toEqual({
      chosen: null,
      intended: null,
    })
  })
})

describe("racing", () => {
  const rushedRun = (flags: Array<boolean | null>): Array<LensRecordEntry> =>
    flags.map((rushed) => ({ ...entry({}), rushed }))

  it("is three of five answers rushed, at any point, and skips expiries", () => {
    expect(racing(rushedRun([true, false, true, false, false]))).toBe(false)
    expect(racing(rushedRun([true, null, true, false, true]))).toBe(true)
    expect(
      racing(rushedRun([true, true, true, false, false, false, false]))
    ).toBe(true)
  })
})
