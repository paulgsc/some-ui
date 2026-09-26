import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { describe, expect, it } from "vitest"

import { auditTopikFile } from "."

const line = (id: string, korean: string): Record<string, string> => ({
  id,
  role: "assistant",
  content: korean,
  korean,
  english: `gloss of ${id}`,
  timestamp: "00:00",
})

/** One conversation, one line, and whatever probes a case needs. */
const fileWith = (...probes: Array<unknown>): unknown => [
  {
    id: 7,
    messages: [line("m1", "카드로 할게요.")],
    questions: [],
    probes,
  },
]

const option = (
  text: string,
  relation: string,
  valid: boolean,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  text,
  relation,
  valid,
  why: "because",
  ...extra,
})

const oddOneOut = (extra: Record<string, unknown> = {}): unknown => ({
  id: "p",
  kind: "odd-one-out",
  order: 2,
  anchorMessageId: "m1",
  prompt: "Which is NOT valid?",
  options: [
    option("카드로 했어요.", "past", true),
    option("카드로 안 할게요.", "negation", true),
    option("카드로 할게요?", "question", false),
  ],
  ...extra,
})

const messages = (raw: unknown): Array<string> =>
  auditTopikFile(raw).map((f) => `${f.severity}: ${f.message}`)

describe("auditTopikFile", () => {
  it("finds nothing to say about the café fixture", () => {
    expect(auditTopikFile(FIXTURE_BATCHES)).toEqual([])
  })

  it("reports a probe the schema would drop, which loading does silently", () => {
    const [finding] = auditTopikFile(
      fileWith(
        oddOneOut({
          options: [
            option("카드로 했어요.", "past", false),
            option("카드로 안 할게요.", "negation", false),
            option("카드로 할게요?", "question", false),
          ],
        })
      )
    )
    expect(finding).toMatchObject({ batch: 7, probe: "p", severity: "error" })
    expect(finding?.message).toMatch(/dropped at load.*exactly one invalid/)
  })

  it("reports an anchor that names no line", () => {
    expect(messages(fileWith(oddOneOut({ anchorMessageId: "m9" })))).toEqual([
      expect.stringMatching(/error: anchorMessageId "m9".*after the last line/),
    ])
  })

  it("refuses a probe whose answer is a gloss: that is first-order", () => {
    const glossed = {
      id: "g",
      kind: "pick-valid",
      order: 2,
      anchorMessageId: "m1",
      prompt: "What does it mean?",
      options: [
        option("I'll pay by card", "gloss", true, { lang: "en" }),
        option("I paid by card", "gloss", false, { lang: "en" }),
      ],
    }
    expect(messages(fileWith(glossed))).toEqual([
      expect.stringMatching(/error: .*first-order/),
    ])
  })

  it("takes any relation its author names, and any declared order (canon Rem. 4.8)", () => {
    const connectives = {
      id: "c",
      kind: "odd-one-out",
      order: 3,
      anchorMessageId: "m1",
      source: "비가 와서 늦었어요.",
      prompt: "Which is NOT a valid transformation?",
      options: [
        option("비가 오니까 늦었어요.", "reason: -아서 → -(으)니까", true),
        option("비가 와서 늦을 거예요.", "future", true),
        option("비가 와서 늦었습니다.", "more formal", true),
        option("비가 와서 늦으세요.", "request", false),
      ],
    }
    expect(messages(fileWith(connectives))).toEqual([])
  })

  it("warns about a transformation that rewrites the content words", () => {
    const rewritten = oddOneOut({
      options: [
        option("현금으로 드렸습니다.", "past", true),
        option("카드로 안 할게요.", "negation", true),
        option("카드로 할게요?", "question", false),
      ],
    })
    expect(messages(fileWith(rewritten))).toEqual([
      expect.stringMatching(
        /warning: candidate "현금으로 드렸습니다\." rewrites/
      ),
    ])
  })

  it("reports a build the lesson would leave out, and one with nothing to do", () => {
    const build = (id: string, target: string): unknown => ({
      id,
      kind: "build",
      order: 2,
      anchorMessageId: "m1",
      prompt: "Say it",
      relation: "past",
      target,
    })
    expect(
      messages(
        fileWith(
          build("long", "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉"),
          build("same", "카드로 할게요")
        )
      )
    ).toEqual([
      expect.stringMatching(/error: target .* needs 9 tiles/),
      expect.stringMatching(/error: target is the source itself/),
      expect.stringMatching(/warning: the source contains the answer/),
    ])
  })

  it("reports a duplicated id and a blank reason", () => {
    const blank = oddOneOut({
      id: "q",
      options: [
        option("카드로 했어요.", "past", true, { why: " " }),
        option("카드로 안 할게요.", "negation", true),
        option("카드로 할게요?", "question", false),
      ],
    })
    expect(messages(fileWith(oddOneOut(), oddOneOut(), blank))).toEqual([
      expect.stringMatching(/error: shares its id/),
      expect.stringMatching(/error: candidate "카드로 했어요\." has no `why`/),
    ])
  })

  it("notes a conversation left without probes, and refuses a non-topik file", () => {
    expect(
      messages([{ id: 1, messages: [line("m1", "네.")], questions: [] }])
    ).toEqual([expect.stringMatching(/warning: no probes/)])
    expect(messages({ not: "a file" })).toEqual([
      expect.stringMatching(/error: not a topik file/),
    ])
  })
})
