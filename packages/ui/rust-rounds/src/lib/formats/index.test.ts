import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type { Round, RustcRun } from "@rust-rounds/lib/formats"
import {
  expectMatches,
  programLines,
  resolvePrograms,
  RoundLogSchema,
  RoundSchema,
  RustcRunSchema,
  TutorNotesSchema,
} from "@rust-rounds/lib/formats"
import {
  INDEXING_01,
  INDEXING_01_NOTES,
  WORKED_LOG,
} from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const [READ, ...REST] = INDEXING_01.cards
if (READ?.kind !== "read") throw new Error("the worked example changed shape")
const [CHOICE] = READ.choices
if (CHOICE === undefined) throw new Error("the worked example changed shape")

/** The worked example with its first card replaced; the result may be malformed. */
const withFirstCard = (card: object): unknown => ({
  ...INDEXING_01,
  cards: [card, ...REST],
})

const withFirstChoice = (choice: object): unknown =>
  withFirstCard({ ...READ, choices: [choice, ...READ.choices.slice(1)] })

describe("the three schemas", () => {
  it("parse the worked example", () => {
    expect(RoundSchema.parse(INDEXING_01)).toEqual(INDEXING_01)
    expect(RoundLogSchema.parse(WORKED_LOG)).toEqual(WORKED_LOG)
    expect(TutorNotesSchema.parse(INDEXING_01_NOTES)).toEqual(INDEXING_01_NOTES)
  })

  it("refuse a choice that carries `correct`", () => {
    const graded = withFirstChoice({ ...CHOICE, correct: true })
    const result = RoundSchema.safeParse(graded)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["correct"],
      path: ["cards", 0, "choices", 0],
    })
  })

  it("refuse a card that carries a rubric", () => {
    const graded = withFirstCard({ ...READ, rubric: ["trait"] })
    expect(RoundSchema.safeParse(graded).success).toBe(false)
  })

  it("refuse a choice with no `say`", () => {
    const { say: _say, ...pickOnly } = CHOICE
    const silent = withFirstChoice(pickOnly)
    const result = RoundSchema.safeParse(silent)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([
      "cards",
      0,
      "choices",
      0,
      "say",
    ])
  })

  it("refuse two cards with one id, and a hunk that is more than one line", () => {
    const twice = {
      ...INDEXING_01,
      cards: [...INDEXING_01.cards, INDEXING_01.cards[0]],
    }
    expect(RoundSchema.safeParse(twice).success).toBe(false)
    const twoLines: Round = {
      ...INDEXING_01,
      cards: INDEXING_01.cards.map((card) =>
        card.kind === "variant"
          ? {
              ...card,
              hunk: { line: 4, replace: "    let c = 1;\n    let d = 2;" },
            }
          : card
      ),
    }
    expect(RoundSchema.safeParse(twoLines).success).toBe(false)
  })

  it("refuse one choice, and five", () => {
    const one = withFirstCard({ ...READ, choices: [CHOICE] })
    const five = withFirstCard({
      ...READ,
      choices: [...READ.choices, { pick: "Hangs", say: "Say why." }],
    })
    expect(RoundSchema.safeParse(one).success).toBe(false)
    expect(RoundSchema.safeParse(five).success).toBe(false)
  })

  it("refuse audio in the log: notes are named by id", () => {
    const [session] = WORKED_LOG.sessions
    const withAudio = {
      ...WORKED_LOG,
      sessions: [
        {
          ...session,
          cards: session!.cards.map((event) => ({
            ...event,
            audio: "data:audio/webm;base64,AAAA",
          })),
        },
      ],
    }
    expect(RoundLogSchema.safeParse(withAudio).success).toBe(false)
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
  const programs = resolvePrograms(INDEXING_01)
  const line4 = (card: string): string | undefined => {
    const program = programs.get(card)?.program
    return program == null ? undefined : programLines(program)[3]
  }

  it("builds each variant from the card it changes, keeping the final newline", () => {
    expect(line4("a")).toBe("    let c = s[r];")
    expect(line4("b")).toBe("    let c = s.as_bytes()[r];")
    expect(line4("c")).toBe("    let c = &s[1..2];")
    expect(line4("d")).toBe("    let c = &s[1..3];")
    expect(programs.get("d")?.program?.endsWith("}\n")).toBe(true)
    expect(programLines(programs.get("d")?.program ?? "")).toHaveLength(6)
  })

  it("says why a hunk gives no program", () => {
    const variant = INDEXING_01.cards[1]!
    if (variant.kind !== "variant") throw new Error("fixture changed shape")
    const round: Round = {
      ...INDEXING_01,
      cards: [
        { ...variant, id: "early", of: "a" },
        INDEXING_01.cards[0]!,
        { ...variant, id: "past", hunk: { line: 7, replace: "" } },
        {
          ...variant,
          id: "same",
          hunk: { line: 4, replace: "    let c = s[r];" },
        },
        { ...variant, id: "chained", of: "past" },
      ],
    }
    const problems = [...resolvePrograms(round)].map(([id, resolved]) => [
      id,
      resolved.problem,
    ])
    expect(problems).toEqual([
      ["early", "no-earlier-card"],
      ["a", null],
      ["past", "line-out-of-range"],
      ["same", "changes-nothing"],
      ["chained", "no-earlier-card"],
    ])
  })
})

describe("expectMatches", () => {
  it("holds for every card of the worked example against its recorded run", () => {
    const [session] = WORKED_LOG.sessions
    for (const event of session!.cards) {
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
    const stopped: RustcRun = {
      outcome: "stopped",
      toolchain: "1.97.0",
      why: "time",
      stdout: "",
      stderr: "",
    }
    expect(RustcRunSchema.parse(stopped)).toEqual(stopped)
    expect(expectMatches({ outcome: "panics" }, stopped)).toBe(false)
    expect(
      expectMatches(
        { outcome: "compile-error", code: "E0308" },
        {
          outcome: "compile-error",
          toolchain: "1.97.0",
          code: "E0277",
          stderr: "",
          span: null,
        }
      )
    ).toBe(false)
    expect(
      expectMatches(
        { outcome: "prints", stdout: "z" },
        { outcome: "prints", toolchain: "1.97.0", stdout: "122\n" }
      )
    ).toBe(false)
  })
})

/** Every key and tag a JSON Schema names, however deep. */
function namesIn(schema: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) namesIn(item, names)
  } else if (typeof schema === "object" && schema !== null) {
    const record: Record<string, unknown> = { ...schema }
    if (typeof record.const === "string") names.add(record.const)
    if (Array.isArray(record.enum)) {
      for (const value of record.enum)
        if (typeof value === "string") names.add(value)
    }
    if (typeof record.properties === "object" && record.properties !== null) {
      for (const key of Object.keys(record.properties)) names.add(key)
    }
    for (const value of Object.values(record)) namesIn(value, names)
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
