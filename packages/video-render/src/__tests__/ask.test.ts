/**
 * An ask issue's body carries one ```json ask block, indented or not, which
 * reads as an ask or is refused with every reason.
 */
import { ASK_SCHEMA, askId, parseAskBody } from "@video-render/ask"
import { describe, expect, it } from "vitest"

const ask = {
  schema: ASK_SCHEMA,
  question: "Who answers between turns of a conversation?",
  whyYours: "It decides what the conversation is.",
  options: [
    { says: "A live model", unblocks: "TALK3, TALK6 and TALK9" },
    { says: "A scripted reply", unblocks: "TALK3 only" },
  ],
  recommended: 0,
  refs: [{ repo: "some-ui", kind: "issue", number: 2545 }],
}

const body = (block: unknown, extra = ""): string =>
  `Why this waits on you, in prose.\n\n\`\`\`json ask\n${JSON.stringify(block, null, 2)}\n\`\`\`\n${extra}`

describe("an ask issue's body", () => {
  it("reads as its ask", () => {
    const parsed = parseAskBody(body(ask))
    expect(parsed.ok && parsed.value.question).toBe(ask.question)
  })

  it("reads a block indented under a list item", () => {
    const indented = body(ask)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")
    expect(parseAskBody(indented).ok).toBe(true)
  })

  it("is refused with no block, two blocks, an empty one, or one that isn't JSON", () => {
    expect(parseAskBody("no block here")).toEqual({
      ok: false,
      problems: ["it has no ```json ask block"],
    })
    expect(parseAskBody(body(ask, "\n```json ask\n{}\n```\n"))).toEqual({
      ok: false,
      problems: ["it has more than one ```json ask block"],
    })
    expect(parseAskBody("```json ask\n```")).toEqual({
      ok: false,
      problems: ["its ask block is empty"],
    })
    expect(parseAskBody("```json ask\n{ nope\n```").ok).toBe(false)
  })

  it("is refused for a recommendation it doesn't list", () => {
    expect(parseAskBody(body({ ...ask, recommended: 2 }))).toEqual({
      ok: false,
      problems: ["recommended: it recommends an option it doesn't list"],
    })
  })
})

it("names its id in the call by its repository and number", () => {
  expect(askId({ repo: "some-ui", number: 2630 })).toBe("some-ui-2630")
})
