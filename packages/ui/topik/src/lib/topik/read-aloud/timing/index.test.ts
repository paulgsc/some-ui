import {
  audioWaitMs,
  echoMs,
  GLOSS_MS,
  INTRODUCTION_HOLD_MS,
  LEVEL_RATE,
  MAX_ECHO_MS,
  MAX_SCREEN_MS,
  MAX_SPEECH_MS,
  MAX_TURN_MS,
  MIN_ECHO_MS,
  nextPace,
  nominalRepMs,
  PACE_MAX,
  PACE_MIN,
  sentenceTurnMs,
  SETTLE_MS,
  speechFallbackMs,
  SUMMARY_MS,
  syllablesOf,
  SYNTHESIS_MS,
  wordTurnMs,
} from "@topik/lib/topik/read-aloud/timing"
import { describe, expect, it } from "vitest"

describe("syllablesOf", () => {
  it("counts Hangul syllables and nothing else", () => {
    expect(syllablesOf("한 잔 주세요.")).toBe(5)
    expect(syllablesOf("OK?")).toBe(0)
  })
})

describe("sentenceTurnMs (Cor. 4.6 (ii))", () => {
  it("grows with length and shrinks as the level's rate rises", () => {
    expect(sentenceTurnMs(20, 1)).toBeGreaterThan(sentenceTurnMs(10, 1))
    expect(sentenceTurnMs(20, 1)).toBeGreaterThan(sentenceTurnMs(20, 2))
    expect(sentenceTurnMs(20, 2)).toBeGreaterThan(sentenceTurnMs(20, 3))
  })

  it("is the syllables at the level's rate", () => {
    expect(sentenceTurnMs(30, 3)).toBe(900 + (30 * 1000) / LEVEL_RATE[3])
  })

  it("is capped", () => {
    expect(sentenceTurnMs(10_000, 1)).toBe(MAX_TURN_MS)
  })
})

describe("wordTurnMs and nextPace (Cor. 4.6 (iii))", () => {
  it("scales with the pace factor, within its bounds", () => {
    expect(wordTurnMs(3, 1.5)).toBeGreaterThan(wordTurnMs(3, 1))
    expect(wordTurnMs(3, 100)).toBe(wordTurnMs(3, PACE_MAX))
    expect(wordTurnMs(3, 0)).toBe(wordTurnMs(3, PACE_MIN))
  })

  it("shortens on a clean run and lengthens on a report", () => {
    expect(nextPace(1, false)).toBeLessThan(1)
    expect(nextPace(1, true)).toBeGreaterThan(1)
  })

  it("stays within its bounds however often it moves", () => {
    let factor = 1
    for (let run = 0; run < 50; run += 1) factor = nextPace(factor, true)
    expect(factor).toBe(PACE_MAX)
    for (let run = 0; run < 50; run += 1) factor = nextPace(factor, false)
    expect(factor).toBe(PACE_MIN)
  })
})

describe("echoMs", () => {
  it("follows what was heard, within its bounds", () => {
    expect(echoMs(0, "word")).toBe(MIN_ECHO_MS)
    expect(echoMs(2000, "sentence")).toBe(2000 * 1.2 + 600)
    expect(echoMs(60_000, "word")).toBe(MAX_ECHO_MS.word)
    expect(echoMs(60_000, "sentence")).toBe(MAX_ECHO_MS.sentence)
  })
})

describe("nominalRepMs (Def. 6.6, Prop. 6.4 (iv))", () => {
  it("is fixed by the item's length and the level alone", () => {
    const speech = 3 * 300
    expect(nominalRepMs("word", 3, 1)).toBe(
      SETTLE_MS +
        wordTurnMs(3, 1) +
        speech +
        echoMs(speech, "word") +
        GLOSS_MS.word
    )
    expect(nominalRepMs("word", 3, 1)).toBe(nominalRepMs("word", 3, 3))
    expect(nominalRepMs("sentence", 20, 1)).toBeGreaterThan(
      nominalRepMs("sentence", 20, 3)
    )
  })
})

describe("the two-minute screen bound (Rem. 4.10)", () => {
  it("holds for the longest rep the caps allow", () => {
    for (const kind of ["word", "sentence"] as const) {
      expect(
        SETTLE_MS +
          MAX_TURN_MS +
          SYNTHESIS_MS +
          MAX_SPEECH_MS +
          MAX_ECHO_MS[kind] +
          GLOSS_MS[kind]
      ).toBeLessThanOrEqual(MAX_SCREEN_MS)
    }
  })

  it("holds for an introduction and a summary", () => {
    expect(
      SYNTHESIS_MS + MAX_SPEECH_MS + INTRODUCTION_HOLD_MS
    ).toBeLessThanOrEqual(MAX_SCREEN_MS)
    expect(SUMMARY_MS).toBeLessThanOrEqual(MAX_SCREEN_MS)
  })

  it("caps the wait for speech", () => {
    expect(speechFallbackMs(10_000)).toBe(MAX_SPEECH_MS)
    expect(audioWaitMs(10_000)).toBe(MAX_SPEECH_MS + SYNTHESIS_MS)
  })
})
