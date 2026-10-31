import type { BiteMoment, Said } from "@game-week/lib/bite"
import {
  biteFields,
  line,
  MAX_LINE_CHARS,
  pickedAfter,
} from "@game-week/lib/bite"
import { CATALOG_VERSION } from "@some-ui/game-scenarios"
import { describe, expect, it } from "vitest"

const MOMENT: BiteMoment = {
  gameId: "401772981",
  seq: 41,
  strip: "Q3 8:42 · SF 17, SEA 13",
  watching: true,
  mode: "standard",
  offsetMs: null,
}

const STARTED = Date.UTC(2026, 10, 1, 21, 0, 3, 250)

/** Every field home requires of any bite (GWB5 `SaidBite`). */
const ALWAYS = ["how", "strip", "watching", "started", "mode", "catalog"]

const SAYS: ReadonlyArray<Said> = [
  { how: "offered", scenario: "in.third-long", context: "3rd & 9" },
  { how: "just-happened", scenario: "in.big-play", context: "31 yards" },
  { how: "every-scenario", scenario: "post.result", context: "" },
  { how: "said-first" },
]

describe("biteFields (GW4)", () => {
  it.each(SAYS)("sets every field home requires, said $how", (said) => {
    const fields = biteFields(said, MOMENT, STARTED)
    for (const name of ALWAYS) expect(fields[name], name).toBeDefined()
    expect(fields).toMatchObject({
      how: said.how,
      strip: MOMENT.strip,
      watching: "1",
      started: "2026-11-01T21:00:03.250Z",
      mode: "standard",
      catalog: String(CATALOG_VERSION),
      seq: "41",
    })
  })

  it("names the scenario of every bite but one said first", () => {
    for (const said of SAYS) {
      const fields = biteFields(said, MOMENT, STARTED)
      expect("scenario" in fields).toBe(said.how !== "said-first")
    }
  })

  it("keeps a bite said first saying so when what it was about is picked after it", () => {
    for (const picked of SAYS.slice(0, 3)) {
      expect(pickedAfter(picked, MOMENT, STARTED)).toEqual({
        ...biteFields(picked, MOMENT, STARTED),
        how: "said-first",
      })
    }
    expect(
      pickedAfter(
        { how: "offered", scenario: "in.third-long", context: "3rd & 9" },
        MOMENT,
        STARTED
      )
    ).toMatchObject({
      how: "said-first",
      scenario: "in.third-long",
      context: "3rd & 9",
    })
  })

  it("leaves out a context there was none of, an offer there was none of, and the offset", () => {
    const fields = biteFields(
      { how: "every-scenario", scenario: "post.result", context: "" },
      { ...MOMENT, seq: null, strip: "", watching: false },
      STARTED
    )
    expect(fields).toEqual({
      how: "every-scenario",
      scenario: "post.result",
      strip: "",
      watching: "0",
      started: "2026-11-01T21:00:03.250Z",
      mode: "standard",
      catalog: String(CATALOG_VERSION),
    })
  })

  it("says home's clock against the phone's, in whole milliseconds, once measured (GW5)", () => {
    const fields = biteFields(
      { how: "said-first" },
      { ...MOMENT, offsetMs: -1_234.6 },
      STARTED
    )
    expect(fields.offset).toBe("-1235")
    expect(
      biteFields({ how: "said-first" }, MOMENT, STARTED)
    ).not.toHaveProperty("offset")
  })

  it("keeps the strip and context to one line home takes", () => {
    const long = `a\nb${"x".repeat(600)}`
    const fields = biteFields(
      { how: "offered", scenario: "in.sack", context: long },
      { ...MOMENT, strip: long },
      STARTED
    )
    expect([...(fields.strip ?? "")]).toHaveLength(MAX_LINE_CHARS)
    expect(fields.context).toBe(line(long))
    expect(fields.strip).not.toMatch(/\n/)
  })
})
