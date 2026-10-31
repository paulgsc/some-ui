import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type { Card, Round, RustcRun } from "@rust-rounds/lib/formats"
import {
  expectMatches,
  programLines,
  resolvePrograms,
  RoundLogSchema,
  RoundSchema,
  TutorNotesSchema,
} from "@rust-rounds/lib/formats"
import { INDEXING_01, INDEXING_01_NOTES } from "@rust-rounds/lib/worked-example"
import { WORKED_LOG } from "@rust-rounds/lib/worked-example/fixture"
import { isRecord } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const [READ, VARIANT, ...REST] = INDEXING_01.cards
if (READ?.kind !== "read" || VARIANT?.kind !== "variant") {
  throw new Error("the worked example changed shape")
}
const [CHOICE] = READ.choices
if (CHOICE === undefined) throw new Error("the worked example changed shape")

/** The worked example with its first card replaced; the result may be malformed. */
const withFirstCard = (card: object): unknown => ({
  ...INDEXING_01,
  cards: [card, VARIANT, ...REST],
})

const withCards = (...cards: Array<Card>): Round => ({ ...INDEXING_01, cards })

/** The first issue's path, or null when the value parses. */
const refusedAt = (value: unknown): Array<PropertyKey> | null => {
  const result = RoundSchema.safeParse(value)
  return result.success ? null : (result.error.issues[0]?.path ?? [])
}

describe("the three schemas", () => {
  it("parse the worked example", () => {
    expect(RoundSchema.parse(INDEXING_01)).toEqual(INDEXING_01)
    expect(RoundLogSchema.parse(WORKED_LOG)).toEqual(WORKED_LOG)
    expect(TutorNotesSchema.parse(INDEXING_01_NOTES)).toEqual(INDEXING_01_NOTES)
  })

  it("refuse a choice that carries `correct`", () => {
    const graded = withFirstCard({
      ...READ,
      choices: [{ ...CHOICE, correct: true }, ...READ.choices.slice(1)],
    })
    const result = RoundSchema.safeParse(graded)
    expect(result.error?.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["correct"],
      path: ["cards", 0, "choices", 0],
    })
  })

  it("refuse two cards with one id, and two choices with one pick", () => {
    expect(refusedAt(withCards(READ, VARIANT, READ))).toEqual([
      "cards",
      2,
      "id",
    ])
    const twice = { ...READ, choices: [CHOICE, CHOICE] }
    expect(refusedAt(withFirstCard(twice))).toEqual([
      "cards",
      0,
      "choices",
      1,
      "pick",
    ])
  })

  it("refuse a hunk of more than one line, and a program with a carriage return", () => {
    const twoLines = { ...VARIANT, hunk: { line: 4, replace: "a;\nb;" } }
    expect(refusedAt(withCards(READ, twoLines))).toEqual([
      "cards",
      1,
      "hunk",
      "replace",
    ])
    const crlf = { ...READ, program: READ.program.replaceAll("\n", "\r\n") }
    expect(refusedAt(withFirstCard(crlf))).toEqual(["cards", 0, "program"])
  })

  it("refuse a variant that cannot be built, and take one that changes nothing", () => {
    expect(refusedAt(withCards(VARIANT, READ))).toEqual(["cards", 0, "of"])
    const past = { ...VARIANT, hunk: { line: 7, replace: "" } }
    expect(refusedAt(withCards(READ, past))).toEqual(["cards", 1, "hunk"])
    const chained = { ...VARIANT, id: "e", of: "b" }
    const result = RoundSchema.safeParse(withCards(READ, past, chained))
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["cards", 1, "hunk"],
      ["cards", 2, "of"],
    ])
    const same = { ...VARIANT, hunk: { line: 4, replace: "    let c = s[r];" } }
    expect(refusedAt(withCards(READ, same))).toBeNull()
  })

  it("refuse an edge that is both open and smooth", () => {
    const [concept] = INDEXING_01_NOTES.concepts
    const both = {
      ...INDEXING_01_NOTES,
      concepts: [{ ...concept, smooth: concept!.open.slice(0, 1) }],
    }
    expect(TutorNotesSchema.safeParse(both).success).toBe(false)
  })
})

describe("resolvePrograms", () => {
  it("builds each variant from the card it changes, keeping the final newline", () => {
    const programs = resolvePrograms(INDEXING_01)
    const line4 = (card: string): string | undefined =>
      programLines(programs.get(card) ?? "")[3]
    expect(line4("a")).toBe("    let c = s[r];")
    expect(line4("b")).toBe("    let c = s.as_bytes()[r];")
    expect(line4("c")).toBe("    let c = &s[1..2];")
    expect(line4("d")).toBe("    let c = &s[1..3];")
    expect(programs.get("d")?.endsWith("}\n")).toBe(true)
    expect(programLines(programs.get("d") ?? "")).toHaveLength(6)
  })
})

describe("expectMatches", () => {
  it("holds for every card of the worked example against its recorded run", () => {
    for (const event of WORKED_LOG.sessions[0]!.cards) {
      const card = INDEXING_01.cards.find((each) => each.id === event.card)
      if (
        card === undefined ||
        card.kind === "refine" ||
        event.rustc === null
      ) {
        throw new Error("fixture changed shape")
      }
      expect(expectMatches(card.expect, event.rustc), event.card).toBe(true)
    }
  })

  it("fails on another error code, other output, or a stopped run", () => {
    const run = { toolchain: "1.97.0", compileStderr: "", stdout: "" }
    const stopped: RustcRun = {
      ...run,
      outcome: "stopped",
      why: "time",
      stderr: "",
    }
    expect(expectMatches({ outcome: "panics" }, stopped)).toBe(false)
    const e0277: RustcRun = {
      outcome: "compile-error",
      toolchain: "1.97.0",
      code: "E0277",
      stderr: "",
      span: null,
    }
    expect(
      expectMatches({ outcome: "compile-error", code: "E0308" }, e0277)
    ).toBe(false)
    const prints: RustcRun = { ...run, outcome: "prints", stdout: "122\n" }
    expect(expectMatches({ outcome: "prints", stdout: "z" }, prints)).toBe(
      false
    )
    expect(expectMatches({ outcome: "prints", stdout: "122" }, prints)).toBe(
      true
    )
  })
})

/** Every key and tag a JSON Schema names, however deep. */
function namesIn(schema: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) namesIn(item, names)
  } else if (isRecord(schema)) {
    if (typeof schema.const === "string") names.add(schema.const)
    if (Array.isArray(schema.enum)) {
      for (const value of schema.enum) {
        if (typeof value === "string") names.add(value)
      }
    }
    if (isRecord(schema.properties)) {
      for (const key of Object.keys(schema.properties)) names.add(key)
    }
    for (const value of Object.values(schema)) namesIn(value, names)
  }
  return names
}

describe("ROUTINE.md", () => {
  it("names every field, tag and value the three formats have", () => {
    const names = new Set<string>()
    for (const schema of [RoundSchema, RoundLogSchema, TutorNotesSchema]) {
      namesIn(z.toJSONSchema(schema, { io: "input" }), names)
    }
    expect(names.size).toBeGreaterThan(40)
    const missing = [...names].filter(
      (name) =>
        !ROUTINE.includes(`\`${name}\``) && !ROUTINE.includes(`"${name}"`)
    )
    expect(missing).toEqual([])
  })
})
