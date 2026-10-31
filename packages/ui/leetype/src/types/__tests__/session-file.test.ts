import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import type { SessionScreen } from "@leetype/types/session-file"
import {
  rubricCovers,
  rubricText,
  SessionFileSchema,
} from "@leetype/types/session-file"
import { describe, expect, it } from "vitest"

function minimal(screens: Record<string, unknown>, extra: object = {}): object {
  return {
    title: "A session",
    oneLine: "One round.",
    session: { kind: "probe", budgetMinutes: 5 },
    start: "r1",
    screens,
    ...extra,
  }
}

const end = { type: "end", actions: [] }

describe("SessionFileSchema", () => {
  it.each(AB_FIXTURES)("parses the A/B's variant $variant", ({ raw }) => {
    expect(SessionFileSchema.safeParse(raw).error).toBeUndefined()
  })

  it.each([
    [
      "an edge to a screen that does not exist",
      minimal({
        r1: {
          type: "choice",
          options: [
            { label: "x", next: "end", correct: true },
            { label: "y", next: "nowhere" },
          ],
        },
        end,
      }),
      'leads to "nowhere"',
    ],
    [
      "two correct options",
      minimal({
        r1: {
          type: "choice",
          options: [
            { label: "x", next: "end", correct: true },
            { label: "y", next: "end", correct: true },
          ],
        },
        end,
      }),
      "at most one correct option",
    ],
    [
      "a correct abstention",
      minimal({
        r1: {
          type: "choice",
          options: [
            { label: "x", next: "end" },
            { label: "Not sure", next: "end", abstain: true, correct: true },
          ],
        },
        end,
      }),
      "abstention is never the correct option",
    ],
    [
      "a gloss of a term the glossary lacks",
      minimal({ r1: { ...end, glosses: ["quorum"] } }),
      'glosses "quorum"',
    ],
    [
      "a citation of a screen that is not a reading",
      minimal({
        r1: {
          type: "choice",
          cites: "end",
          rule: "A3",
          options: [
            { label: "x", next: "end", correct: true },
            { label: "y", next: "end" },
          ],
        },
        end,
      }),
      '"end" is not a reading screen',
    ],
    [
      "a key the format does not have",
      minimal({
        r1: {
          type: "choice",
          options: [
            { label: "x", next: "end", corect: true },
            { label: "y", next: "end" },
          ],
        },
        end,
      }),
      "Unrecognized key",
    ],
    [
      "a misspelled top-level key",
      minimal({ r1: end }, { glosary: { quorum: "enough nodes" } }),
      "Unrecognized key",
    ],
    [
      "more than five options",
      minimal({
        r1: {
          type: "choice",
          options: ["a", "b", "c", "d", "e", "f"].map((label, index) => ({
            label,
            next: "end",
            correct: index === 0,
          })),
        },
        end,
      }),
      "Too big",
    ],
    [
      "a rule outside the registers",
      minimal({
        r1: {
          type: "choice",
          rule: "Q1",
          options: [
            { label: "x", next: "end", correct: true },
            { label: "y", next: "end" },
          ],
        },
        end,
      }),
      "a Machine or Agreement id",
    ],
    [
      "a response named on a screen that returns no round",
      minimal({
        r1: {
          type: "choice",
          returnFor: "abstain",
          options: [
            { label: "x", next: "end", correct: true },
            { label: "y", next: "end" },
          ],
        },
        end,
      }),
      "it needs returnOf",
    ],
    [
      "a rubric point that is an object without `covers`",
      minimal({
        r1: {
          type: "record",
          prompt: "Why?",
          maxSeconds: 60,
          rubric: [{ text: "A majority" }],
          weakIfFewerThan: 0,
          next: "end",
        },
        end,
      }),
      "Invalid input",
    ],
    [
      "a rubric that mixes text with points saying what they cover",
      minimal({
        r1: {
          type: "record",
          prompt: "Why?",
          maxSeconds: 60,
          rubric: ["Why", { text: "A majority", covers: [] }],
          weakIfFewerThan: 0,
          next: "end",
        },
        end,
      }),
      "never a mix",
    ],
  ])("rejects %s", (_name, file, message) => {
    const result = SessionFileSchema.safeParse(file)
    expect(result.success).toBe(false)
    expect(
      result.error?.issues.map((issue) => issue.message).join("\n")
    ).toContain(message)
  })

  it("reads a rubric point as its text, with the rounds it covers or none said (Rem. 11.10)", () => {
    const take = (rubric: ReadonlyArray<unknown>): SessionScreen | undefined =>
      SessionFileSchema.parse(
        minimal({
          r1: {
            type: "record",
            prompt: "Why?",
            maxSeconds: 60,
            rubric,
            weakIfFewerThan: 0,
            next: "end",
          },
          end,
        })
      ).screens.r1
    const known = take([
      { text: "A majority", covers: ["r0", "r2"] },
      { text: "Why", covers: ["r2"] },
      { text: "Said aloud", covers: [] },
    ])
    if (known?.type !== "record") throw new Error("r1 is a take")
    expect(rubricText(known)).toEqual(["A majority", "Why", "Said aloud"])
    expect(rubricCovers(known)).toEqual(["r0", "r2"])
    const unknown = take(["A majority", "Why"])
    if (unknown?.type !== "record") throw new Error("r1 is a take")
    expect(rubricText(unknown)).toEqual(["A majority", "Why"])
    expect(rubricCovers(unknown)).toBeNull()
  })
})
