import type { ComparedWord } from "@video-render/hearings"
import { compareHearings, DRIFT_MS } from "@video-render/hearings"
import type { HeardWord } from "@video-render/take-check"
import { checkTake } from "@video-render/take-check"
import { describe, expect, it } from "vitest"

/**
 * `text` heard word by word, from `fromMs`: each word 400 ms long, a word
 * every `stepMs`. faster-whisper writes a space before each word.
 */
function heard(
  text: string,
  fromMs = 0,
  { stepMs = 500, lead = "" }: { stepMs?: number; lead?: string } = {}
): Array<HeardWord> {
  return text.split(/\s+/).map((word, n) => ({
    text: `${lead}${word}`,
    startMs: fromMs + stepMs * n,
    endMs: fromMs + stepMs * n + 400,
  }))
}

/** What each word reads as, and who heard it, `?` marking unsure. */
const read = (words: ReadonlyArray<ComparedWord>): Array<string> =>
  words.map(
    (word) => `${word.text}:${word.heardBy}${word.unsure === true ? "?" : ""}`
  )

const LINE = "Following the model paid off this week: three of four picks hit."

describe("compareHearings", () => {
  it("agrees on every word two hearings heard alike, as home heard them", () => {
    const home = heard(LINE)
    const session = heard(LINE, 0, { lead: " " })
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([])
    expect(compared.agreed).toBe(12)
    expect(compared.offsetMs).toBe(0)
    expect(compared.words.map((word) => word.text)).toEqual(LINE.split(" "))
    expect(compared.words.every((word) => word.heardBy === "both")).toBe(true)
    expect(checkTake({ voice: "read", line: LINE }, compared.words)).toEqual({
      kind: "ok",
    })
  })

  it("reads a number written two ways as one word, never a difference", () => {
    const home = heard("we went 21 and 3 for 2,500 yards at 3.5 a carry")
    const session = heard(
      "we went twenty-one and three for two thousand five hundred yards at three point five a carry",
      0,
      { stepMs: 300 }
    )
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([])
    expect(compared.words.map((word) => word.text)).toEqual(
      "we went 21 and 3 for 2,500 yards at 3.5 a carry".split(" ")
    )
  })

  it("marks a word one hearing dropped, and the take check calls it unsure", () => {
    const home = heard(LINE)
    // The session's model lost "paid": everything after shifts a word.
    const session = [
      ...heard("Following the model", 0),
      ...heard("off this week: three of four picks hit.", 1_500),
    ]
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([
      { startMs: 1_500, endMs: 1_900, home: "paid", session: "" },
    ])
    expect(read(compared.words).slice(2, 5)).toEqual([
      "model:both",
      "paid:home?",
      "off:both",
    ])
    expect(checkTake({ voice: "read", line: LINE }, compared.words)).toEqual({
      kind: "check",
      coverage: 11 / 12,
      facts: [{ fact: LINE, unsure: ["paid"], missing: [] }],
    })
  })

  it("keeps a word only the session heard, unsure, so the check never calls it missing", () => {
    const home = [...heard("three of four", 0), ...heard("hit", 2_000)]
    const session = heard("three of four picks hit", 0)
    const compared = compareHearings(home, session)
    expect(read(compared.words)).toEqual([
      "three:both",
      "of:both",
      "four:both",
      "picks:session?",
      "hit:both",
    ])
    expect(compared.disagreements).toEqual([
      { startMs: 1_500, endMs: 1_900, home: "", session: "picks" },
    ])
    expect(
      checkTake({ voice: "ad-lib", keep: ["3 of 4 picks hit"] }, compared.words)
    ).toEqual({
      kind: "check",
      coverage: null,
      facts: [{ fact: "3 of 4 picks hit", unsure: ["pick"], missing: [] }],
    })
  })

  it("keeps both words of a substitution, each unsure and each named", () => {
    const home = heard("three of four picks hit")
    const session = heard("three of four kicks hit")
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([
      { startMs: 1_500, endMs: 1_900, home: "picks", session: "kicks" },
    ])
    expect(read(compared.words)).toEqual([
      "three:both",
      "of:both",
      "four:both",
      "picks:home?",
      "kicks:session?",
      "hit:both",
    ])
    // Whichever is right, the line's word is reported unsure, not missing.
    expect(
      checkTake(
        { voice: "read", line: "three of four kicks hit" },
        compared.words
      )
    ).toMatchObject({
      kind: "check",
      facts: [{ unsure: ["kick"], missing: [] }],
    })
  })

  it("flags Korean that home heard as Korean and the English-only model could not", () => {
    // whisper.cpp's multilingual model writes Hangul; small.en romanizes it.
    const home = heard("the word for love is 사랑 in Korean")
    const session = heard("the word for love is salang in Korean", 0, {
      lead: " ",
    })
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([
      { startMs: 2_500, endMs: 2_900, home: "사랑", session: "salang" },
    ])
    expect(read(compared.words).slice(4, 7)).toEqual([
      "is:both",
      "사랑:home?",
      "salang:session?",
    ])
    expect(
      checkTake({ voice: "ad-lib", keep: ["사랑 means love"] }, compared.words)
    ).toMatchObject({
      kind: "check",
      facts: [{ unsure: ["사랑"], missing: ["mean"] }],
    })
  })

  it("lines the two up across the engines' timing drift, and says how far the session's clock ran", () => {
    const home = heard(LINE)
    // The session places each word 350 ms later, give or take 150 ms.
    const session = heard(LINE, 0).map((word, n) => ({
      ...word,
      startMs: word.startMs + 350 + (n % 3) * 75 - 75,
      endMs: word.endMs + 350 + (n % 3) * 75 - 75,
    }))
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([])
    expect(compared.offsetMs).toBe(350)
    // A clock off by more than the drift is set to home's first.
    const late = heard(LINE, 2_400)
    expect(compareHearings(home, late).disagreements).toEqual([])
    expect(compareHearings(home, late).offsetMs).toBe(2_400)
  })

  it("puts the session's words on home's clock where the two differ", () => {
    const home = heard("three of four picks hit")
    const session = heard("three of four kicks hit", 2_000)
    const compared = compareHearings(home, session)
    expect(compared.words.find((word) => word.text === "kicks")).toMatchObject({
      startMs: 1_500,
      endMs: 1_900,
    })
  })

  it("never matches a word heard at another moment of the take", () => {
    const home = heard("go home now and then go home")
    // The session placed the last "home" far from where home heard it.
    const session = home.map((word, n) =>
      n === 6 ? { ...word, startMs: 3_000 + DRIFT_MS + 1_000 } : word
    )
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([
      { startMs: 3_000, endMs: 3_400, home: "home", session: "home" },
    ])
    expect(
      compareHearings(home, session, { driftMs: 5_000 }).disagreements
    ).toEqual([])
  })

  it("never counts a filler one engine wrote as a difference", () => {
    const home = heard("so um the plan is uh simple")
    const session = [...heard("so the plan is", 0), ...heard("simple", 2_500)]
    const compared = compareHearings(home, session)
    expect(compared.disagreements).toEqual([])
    expect(read(compared.words)).toContain("um:home")
    expect(read(compared.words)).toContain("uh:home")
  })

  it("joins neighbouring differences into one stretch", () => {
    const home = heard("the plan was simple")
    const session = heard("the plant wasn't simple")
    expect(compareHearings(home, session).disagreements).toEqual([
      {
        startMs: 500,
        endMs: 1_400,
        home: "plan was",
        session: "plant wasn't",
      },
    ])
  })

  it("keeps home's own doubt: a word home was unsure of stays so, and its p stays", () => {
    const home = heard("three of four").map((word, n) =>
      n === 2 ? { ...word, p: 0.3 } : word
    )
    const session = heard("three of four")
    const compared = compareHearings(home, session)
    expect(compared.words[2]).toEqual({
      text: "four",
      startMs: 1_000,
      endMs: 1_400,
      p: 0.3,
      heardBy: "both",
    })
  })

  it("marks every word unsure when only one hearing heard anything", () => {
    const home = heard("three of four")
    const compared = compareHearings(home, [])
    expect(read(compared.words)).toEqual([
      "three:home?",
      "of:home?",
      "four:home?",
    ])
    expect(compared.disagreements).toEqual([
      { startMs: 0, endMs: 1_400, home: "three of four", session: "" },
    ])
    expect(compareHearings([], [])).toEqual({
      words: [],
      disagreements: [],
      agreed: 0,
      offsetMs: 0,
    })
  })
})
