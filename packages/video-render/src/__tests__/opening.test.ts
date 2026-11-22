/**
 * Rust Rounds' opening as a conversation (#3269, C737, C738): what
 * `conversationProblems` holds a standing set to.
 */
import {
  CONVERSATION_MOST,
  CONVERSATION_WORDS,
  conversationProblems,
  MONIKER,
} from "@video-render/opening"
import { describe, expect, it } from "vitest"

/** `n` words of an answer, the first of them the moniker when `first`. */
const said = (n: number, first = false): string =>
  [first ? MONIKER : "word", ...Array.from({ length: n - 1 }, () => "word")]
    .join(" ")
    .replace(/(.{60}) /gu, "$1\n")

const exchanges = (
  ...lengths: Array<number>
): Array<{ ask: string; script: string }> =>
  lengths.map((n, i) => ({ ask: "Why do it?", script: said(n, i === 0) }))

describe("a conversation opening", () => {
  it("takes one to three exchanges whose answers run two to three minutes together", () => {
    expect(conversationProblems(exchanges(150, 150, 150), "opening")).toEqual(
      []
    )
    expect(
      conversationProblems(exchanges(CONVERSATION_WORDS.min), "o")
    ).toEqual([])
    expect(conversationProblems(exchanges(200, 200, 110), "o")).toEqual([])
  })

  it("measures the answers together, not each", () => {
    expect(conversationProblems(exchanges(100, 100, 100), "o")).toEqual([
      `o: the answers run 300 words together; write ${CONVERSATION_WORDS.min} to ${CONVERSATION_WORDS.max}`,
    ])
    expect(conversationProblems(exchanges(200, 200, 200), "o")).toEqual([
      `o: the answers run 600 words together; write ${CONVERSATION_WORDS.min} to ${CONVERSATION_WORDS.max}`,
    ])
  })

  it("asks three questions at most, and at least one", () => {
    expect(conversationProblems(exchanges(100, 100, 100, 100), "o")[0]).toEqual(
      `o: 4 questions; ask 1 to ${CONVERSATION_MOST}`
    )
    expect(conversationProblems([], "o")[0]).toEqual(
      `o: 0 questions; ask 1 to ${CONVERSATION_MOST}`
    )
  })

  it("says the moniker first, asks briefly and never assesses", () => {
    const [first, ...rest] = exchanges(150, 150, 150)
    if (first === undefined) throw new Error("no exchange")
    expect(
      conversationProblems(
        [
          { ...first, script: first.script.replace(MONIKER, "hello") },
          {
            ask: "How ready are you, and what is your score after all these many long weeks of it, honestly, tell me now?",
            script: rest[0]?.script ?? "",
          },
          { ask: "Why?", script: `${rest[1]?.script ?? ""} graded` },
        ],
        "o"
      )
    ).toEqual([
      `o[0].script: the first answer says "${MONIKER}" in its first line`,
      "o[1].ask: 21 words; ask in 1 to 20",
      `o[1].ask: "How ready" assesses; the opening says what the practice trains, with no rating and no finish line`,
      `o[1].ask: "score" assesses; the opening says what the practice trains, with no rating and no finish line`,
      `o[2].script: "graded" assesses; the opening says what the practice trains, with no rating and no finish line`,
    ])
  })
})
