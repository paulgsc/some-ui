import {
  intakeTree,
  treeFixRequest,
} from "@topik/lib/topik/generation/tree-intake"
import TREE_PROMPT from "@topik/lib/topik/generation/tree-prompt.md?raw"
import { describe, expect, it } from "vitest"

/** The prompt's worked example: the one tree it tells every model to copy. */
const workedExample = (): string => {
  const section = TREE_PROMPT.slice(TREE_PROMPT.indexOf("## Worked example"))
  const open = section.indexOf("```json\n") + "```json\n".length
  return section.slice(open, section.indexOf("```", open))
}

const fenced = (value: unknown): string =>
  `Here it is.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`

describe("intakeTree", () => {
  it("says when a reply holds no tree: prose, or a conversation lesson", () => {
    expect(intakeTree("no json here").status).toBe("absent")
    expect(intakeTree(fenced([{ id: 1, messages: [] }])).status).toBe("absent")
  })

  it("passes the tree prompt's own worked example, clean", () => {
    const intake = intakeTree(fenced(JSON.parse(workedExample())))
    expect(intake).toMatchObject({ status: "checked", findings: [] })
  })

  it("rejects a tree the story audit rejects, every finding by path", () => {
    const tree: Record<string, unknown> = JSON.parse(workedExample())
    const intake = intakeTree(fenced({ ...tree, pov: "nobody", cast: [] }))
    expect(intake.status).toBe("rejected")
    if (intake.status !== "rejected") return
    expect(intake.findings[0]).toEqual({
      audit: "story",
      severity: "error",
      path: "cast",
      message: "must be a non-empty array of characters",
    })
  })
})

describe("treeFixRequest", () => {
  it("lists each finding with its audit and path", () => {
    expect(
      treeFixRequest([
        {
          audit: "story",
          severity: "error",
          path: "",
          message: "a lesson must be an object",
        },
        {
          audit: "teaching",
          severity: "warning",
          path: "root.choice.check",
          message: "m",
        },
      ])
    ).toBe(
      [
        "The app checked the scene tree you wrote and found these problems. Fix them and return the whole tree again, in one JSON block:",
        "",
        "- error (story) at the lesson: a lesson must be an object",
        "- warning (teaching) at root.choice.check: m",
        "",
      ].join("\n")
    )
  })
})
