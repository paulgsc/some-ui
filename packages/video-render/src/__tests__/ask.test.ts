/**
 * An ask issue's body carries one ```json ask block, which reads as an ask
 * or is refused with every reason, and becomes the weekly call's item with
 * the issue itself first among its refs.
 */
import { ASK_SCHEMA, askId, callAskOf, parseAskBody } from "@video-render/ask"
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

  it("is refused with no block, two blocks, or a block that isn't an ask", () => {
    expect(parseAskBody("no block here")).toEqual({
      ok: false,
      problems: ["it has no ```json ask block"],
    })
    expect(parseAskBody(body(ask, `\n\`\`\`json ask\n{}\n\`\`\`\n`)).ok).toBe(
      false
    )
    expect(parseAskBody("```json ask\n{ nope\n```").ok).toBe(false)
    expect(
      parseAskBody(body({ ...ask, recommended: 2 })).ok ||
        parseAskBody(body({ ...ask, options: [ask.options[0]] })).ok ||
        parseAskBody(
          body({ ...ask, options: [ask.options[0], ask.options[0]] })
        ).ok
    ).toBe(false)
  })
})

describe("an ask as the call's item", () => {
  it("takes its id from the issue, which leads its refs once", () => {
    const issue = { repo: "some-ui" as const, number: 2630, body: body(ask) }
    const item = callAskOf(issue, "First, TALK's first decision.")
    expect(item.ok && item.value).toMatchObject({
      id: askId(issue),
      said: "First, TALK's first decision.",
      recommended: 0,
      refs: [
        { repo: "some-ui", kind: "issue", number: 2630 },
        { repo: "some-ui", kind: "issue", number: 2545 },
      ],
    })
    expect(askId(issue)).toBe("some-ui-2630")
  })

  it("names the issue in every reason it can't be read", () => {
    expect(
      callAskOf({ repo: "server", number: 9, body: "nothing" }, "x")
    ).toEqual({
      ok: false,
      problems: ["server#9: it has no ```json ask block"],
    })
  })
})
