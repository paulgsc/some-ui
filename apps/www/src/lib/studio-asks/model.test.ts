/**
 * @vitest-environment node
 *
 * Studio's asks (SFEED1): what GitHub's list reads as, and the order they
 * are listed in, which ranks none.
 */
import { describe, expect, it } from "vitest"

import type { Issues } from "./model"
import { asksOf, aToZ, questionOf } from "./model"

const block = (question: string): string =>
  [
    "Some prose for a reader on GitHub.",
    "",
    "```json ask",
    JSON.stringify({
      schema: "some-ui.ask/1",
      question,
      whyYours: "Only you decide it.",
      options: [
        { says: "Yes", unblocks: "the next story" },
        { says: "Not yet", unblocks: "nothing" },
      ],
      recommended: 0,
    }),
    "```",
  ].join("\n")

const issue = (
  number: number,
  title: string,
  body: string | null,
  extra: object = {}
): Issues[number] => ({
  number,
  title,
  html_url: `https://github.com/paulgsc/some-ui/issues/${number}`,
  body,
  ...extra,
})

describe("the asks", () => {
  it("read each issue's ask, and keep the title without its tag", () => {
    const [ask] = asksOf("some-ui", [
      issue(2673, "[ASK] Which music under the voice?", block("Which music?")),
    ])
    expect(ask.id).toBe("some-ui-2673")
    expect(ask.title).toBe("Which music under the voice?")
    expect(ask.ask?.options.map((o) => o.says)).toEqual(["Yes", "Not yet"])
    expect(questionOf(ask)).toBe("Which music?")
  })

  it("list an ask whose block can't be read by its title", () => {
    const asks = asksOf("server", [
      issue(9, "[ASK] Redeploy home?", "no block here"),
      issue(10, "[ASK] An empty one", null),
    ])
    expect(asks.map((a) => [a.id, a.ask, questionOf(a)])).toEqual([
      ["server-9", null, "Redeploy home?"],
      ["server-10", null, "An empty one"],
    ])
  })

  it("never take a pull request for an ask", () => {
    const asks = asksOf("some-ui", [
      issue(1, "[ASK] A real one", block("Real?")),
      issue(2, "A pull request", block("Not an ask?"), { pull_request: {} }),
    ])
    expect(asks.map((a) => a.number)).toEqual([1])
  })

  it("list both repositories' asks A to Z by what each asks", () => {
    const ui = asksOf("some-ui", [
      issue(3, "[ASK] c", block("Which voice?")),
      issue(4, "[ASK] a", block("Answer between turns?")),
    ])
    const home = asksOf("server", [issue(5, "[ASK] Move the pin?", "")])
    expect(aToZ([ui, home]).map((a) => a.id)).toEqual([
      "some-ui-4",
      "server-5",
      "some-ui-3",
    ])
  })
})
