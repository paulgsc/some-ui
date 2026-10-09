import { scenesOf } from "@some-ui/makjang"
import {
  intakeTree,
  treeEntry,
  treeFixRequest,
} from "@topik/lib/topik/generation/tree-intake"
import {
  fenced,
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

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

describe("treeEntry", () => {
  it("counts the tree's choices and beats, and tags its own level", () => {
    const lesson = workedLesson()
    const scenes = scenesOf(lesson.root).map(({ scene }) => scene)
    expect(
      treeEntry(lesson, {
        key: "first-tea",
        displayName: " ",
        description: " Tea with the chairman. ",
        // A typed level the tree does not have gives way to the tree's.
        tags: ["topik-5", "makjang"],
      })
    ).toEqual({
      key: "first-tea",
      displayName: lesson.root.place,
      description: "Tea with the chairman.",
      batchCount: 1,
      totalQuestions: scenes.filter((scene) => scene.choice).length,
      totalMessages: scenes.reduce((sum, scene) => sum + scene.beats.length, 0),
      difficulty: "beginner",
      tags: ["topik-2", "makjang"],
    })
  })
})
