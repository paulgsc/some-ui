/**
 * An ask issue's body carries one ```json ask block, indented or not, which
 * reads as an ask or is refused with every reason.
 */
import {
  ASK_SCHEMA,
  ASK_SCHEMA_V1,
  ASK_SCHEMA_V2,
  askId,
  callOptionsOf,
  parseAskBody,
} from "@video-render/ask"
import { describe, expect, it } from "vitest"

const ask = {
  schema: ASK_SCHEMA,
  kind: "decision",
  question: "Who answers between turns of a conversation?",
  whyYours: "It decides what the conversation is.",
  waits: "claude",
  call: "story",
  unblocks: "the conversation's next stories",
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

const checklist = {
  schema: ASK_SCHEMA,
  kind: "checklist",
  question: "Will you set up the key home's photographer reads Grafana with?",
  whyYours: "It is a credential only you can make.",
  waits: "pipeline",
  call: "environment",
  steps: [
    {
      says: "A Grafana key",
      where: "Grafana on home",
      do: ["Add a service account named site-shots", "Copy its token"],
    },
    {
      says: "Redeploy home",
      do: ["Redeploy as you usually do"],
      paste: "The deploy's last lines",
    },
  ],
  unblocks: "the server card's clip on the public site",
}

/** `ask` as `/2` filed it: no shared part. */
const {
  waits: _w,
  call: _c,
  unblocks: _u,
  ...decisionV2
} = {
  ...ask,
  schema: ASK_SCHEMA_V2,
}
/** `ask` as `/1` filed it: no kind either. */
const { kind: _kind, ...decisionV1 } = { ...decisionV2, schema: ASK_SCHEMA_V1 }
/** `checklist` as `/2` filed it: its own `unblocks`, no waits or call. */
const {
  waits: _cw,
  call: _cc,
  ...checklistV2
} = {
  ...checklist,
  schema: ASK_SCHEMA_V2,
}

describe("an ask filed before /3 (C1200)", () => {
  it("reads a /1 decision as a /3 one, with what it never said as null", () => {
    const parsed = parseAskBody(body(decisionV1))
    expect(parsed.ok && parsed.value).toEqual({
      ...ask,
      waits: null,
      call: null,
      unblocks: null,
    })
  })

  it("reads a /2 decision and checklist as /3, keeping a checklist's unblocks", () => {
    const decided = parseAskBody(body(decisionV2))
    expect(decided.ok && decided.value).toEqual({
      ...ask,
      waits: null,
      call: null,
      unblocks: null,
    })
    const listed = parseAskBody(body(checklistV2))
    expect(listed.ok && listed.value).toEqual({
      ...checklist,
      refs: [],
      waits: null,
      call: null,
    })
  })

  it("refuses a /1 block that names a kind, and a /2 one with the shared part", () => {
    expect(parseAskBody(body({ ...decisionV1, kind: "decision" })).ok).toBe(
      false
    )
    expect(parseAskBody(body({ ...decisionV2, waits: "claude" })).ok).toBe(
      false
    )
  })
})

describe("an ask's shared part (C1200)", () => {
  it("is required of /3, from the owner's lists alone", () => {
    const { waits: _x, ...noWaits } = ask
    expect(parseAskBody(body(noWaits)).ok).toBe(false)
    expect(parseAskBody(body({ ...ask, call: "vibes" })).ok).toBe(false)
    expect(parseAskBody(body({ ...ask, waits: "owner" })).ok).toBe(false)
    const { unblocks: _y, ...noUnblocks } = checklist
    expect(parseAskBody(body(noUnblocks)).ok).toBe(false)
  })
})

describe("an ask of each kind (C1095)", () => {
  it("reads a checklist's steps in order", () => {
    const parsed = parseAskBody(body(checklist))
    expect(parsed.ok && parsed.value.kind).toBe("checklist")
    expect(
      parsed.ok && parsed.value.kind === "checklist"
        ? parsed.value.steps.map((s) => s.says)
        : null
    ).toEqual(["A Grafana key", "Redeploy home"])
  })

  it("refuses a checklist with no steps, two steps the same, or options", () => {
    expect(parseAskBody(body({ ...checklist, steps: [] })).ok).toBe(false)
    const [one] = checklist.steps
    expect(parseAskBody(body({ ...checklist, steps: [one, one] }))).toEqual({
      ok: false,
      problems: ["steps: two steps say the same"],
    })
    expect(parseAskBody(body({ ...checklist, options: ask.options })).ok).toBe(
      false
    )
  })

  it("says why a /1 block is refused, as before kinds", () => {
    expect(parseAskBody(body({ ...decisionV1, recommended: 5 }))).toEqual({
      ok: false,
      problems: ["recommended: it recommends an option it doesn't list"],
    })
  })

  it("gives the call each kind's options: a checklist's are Done and Not yet", () => {
    const read = parseAskBody(body(checklist))
    expect(read.ok && callOptionsOf(read.value)).toEqual({
      options: [
        { says: "Done", unblocks: checklist.unblocks },
        { says: "Not yet", unblocks: "nothing yet" },
      ],
      recommended: 0,
    })
    const decided = parseAskBody(body(ask))
    expect(decided.ok && callOptionsOf(decided.value)).toEqual({
      options: ask.options,
      recommended: 0,
    })
  })

  it("refuses a decision with steps, or with no kind", () => {
    expect(parseAskBody(body({ ...ask, steps: checklist.steps })).ok).toBe(
      false
    )
    const { kind: _kind, ...kindless } = ask
    expect(parseAskBody(body(kindless)).ok).toBe(false)
  })
})

it("names its id in the call by its repository and number", () => {
  expect(askId({ repo: "some-ui", number: 2630 })).toBe("some-ui-2630")
})
