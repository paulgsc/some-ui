import type { OperatorLesson } from "@lesson-crm/lib/client"
import {
  draftLesson,
  EMPTY_FORM,
  fillForm,
  formFromLesson,
  keyProblem,
  parseTags,
  servedBody,
  servedTreeBody,
  TREE_REJECTED,
} from "@lesson-crm/lib/draft"
import { intakeLesson, intakeTree } from "@some-ui/topik"
import { describe, expect, it } from "vitest"

import { LESSON, REPLY, TREE, treeReply } from "./fixture"

describe("draftLesson", () => {
  it("serves the lesson as intake leaves it, under the form's key and entry", () => {
    const form = fillForm(EMPTY_FORM, REPLY)
    expect(form).toEqual({
      key: "cafe-order",
      displayName: "At the café",
      description: "Ordering a coffee.",
      tags: ["topik-1", "cafe"],
      difficulty: "beginner",
    })
    const draft = draftLesson(REPLY, form)
    if (!draft.ok) throw new Error(draft.error)
    expect(draft.write.activityId).toBe("topik")
    expect(draft.write.metadata).toEqual({
      key: "cafe-order",
      displayName: "At the café",
      description: "Ordering a coffee.",
      batchCount: 1,
      totalQuestions: 1,
      totalMessages: 2,
      difficulty: "beginner",
      tags: ["topik-1", "cafe"],
    })
    expect(JSON.parse(draft.write.body)).toEqual(draft.intake?.batches)
  })

  it("saves an unchanged stored lesson as the same bytes, so the server reports it unchanged", () => {
    const first = draftLesson(REPLY, fillForm(EMPTY_FORM, REPLY))
    if (!first.ok) throw new Error(first.error)
    // What the editor reads back is exactly what was written.
    const again = draftLesson(first.write.body, fillForm(EMPTY_FORM, REPLY))
    if (!again.ok) throw new Error(again.error)
    expect(again.write.body).toBe(first.write.body)
    expect(again.write.metadata).toEqual(first.write.metadata)
  })

  it("keeps a stored lesson's authored tags across an edit, though the file carries none", () => {
    const stored: OperatorLesson = {
      key: "cafe-order",
      displayName: "At the café",
      description: "d",
      batchCount: 1,
      totalQuestions: 1,
      totalMessages: 2,
      difficulty: "beginner",
      tags: ["topik-1", "makjang"],
      activityId: "topik",
      publishedAt: "2026-09-27T00:00:00+00:00",
      version: 1,
      contentHash: "h",
      retiredAt: null,
    }
    const form = formFromLesson(stored)
    expect(form.tags).toEqual(["topik-1", "makjang"])
    const draft = draftLesson(servedBody(intakeOk(REPLY)), form)
    if (!draft.ok) throw new Error(draft.error)
    expect(draft.write.metadata.tags).toEqual(["topik-1", "makjang"])
  })

  it("refuses what the server would, and what intake would", () => {
    const form = fillForm(EMPTY_FORM, REPLY)
    for (const key of [
      "",
      "a/b",
      "https://x",
      ".hidden",
      "manifest",
      " a",
      "a?b",
      "a#b",
      "a b",
      "café",
    ]) {
      const draft = draftLesson(REPLY, { ...form, key })
      expect(draft.ok, key).toBe(false)
    }
    expect(draftLesson("not a lesson", form)).toMatchObject({ ok: false })
  })

  it("never lets a pasted reply overwrite what the operator typed", () => {
    const typed = { ...EMPTY_FORM, key: "mine", displayName: "Mine" }
    expect(fillForm(typed, REPLY)).toMatchObject({
      key: "mine",
      displayName: "Mine",
      description: "Ordering a coffee.",
    })
  })
})

describe("draftLesson on a scene tree", () => {
  it("saves a checked tree, as it plays, under the trees' own activity", () => {
    const form = fillForm(EMPTY_FORM, treeReply())
    expect(form).toMatchObject({ key: "cafe-tree", displayName: "카페" })
    const draft = draftLesson(treeReply(), form)
    if (!draft.ok || !draft.tree) throw new Error(JSON.stringify(draft))
    expect(draft.tree).toMatchObject({ status: "checked", findings: [] })
    expect(draft.write).toMatchObject({
      activityId: "makjang",
      metadata: {
        key: "cafe-tree",
        displayName: "카페",
        batchCount: 1,
        difficulty: "beginner",
        tags: ["topik-1"],
      },
      body: servedTreeBody(draft.tree.lesson),
    })
  })

  it("round-trips: the stored tree reads back as the same lesson and the same bytes", () => {
    const first = draftLesson(treeReply(), fillForm(EMPTY_FORM, treeReply()))
    if (!first.ok || !first.tree) throw new Error(JSON.stringify(first))
    const intake = intakeTree(first.write.body)
    expect(intake).toMatchObject({ status: "checked" })
    if (intake.status !== "checked") return
    expect(intake.lesson).toEqual(first.tree.lesson)
    const again = draftLesson(
      first.write.body,
      fillForm(EMPTY_FORM, treeReply())
    )
    if (!again.ok) throw new Error(again.error)
    expect(again.write).toEqual(first.write)
  })

  it("offers nothing to save for a tree the audits reject, or under a bad key", () => {
    const rejected = treeReply({ ...TREE, pov: "nobody" })
    expect(draftLesson(rejected, { ...EMPTY_FORM, key: "k" })).toMatchObject({
      ok: false,
      error: TREE_REJECTED,
      tree: { status: "rejected" },
    })
    expect(
      draftLesson(treeReply(), { ...EMPTY_FORM, key: "manifest" })
    ).toMatchObject({ ok: false, tree: { status: "checked" } })
  })
})

describe("parseTags and keyProblem", () => {
  it("splits typed tags, keeping each once", () => {
    expect(parseTags("topik-3, makjang,, topik-3")).toEqual([
      "topik-3",
      "makjang",
    ])
  })

  it("accepts a plain key", () => {
    expect(keyProblem("week-40.a")).toBeNull()
    expect(keyProblem("week_40~a")).toBeNull()
  })

  it("refuses a key that collides with another route or lesson", () => {
    expect(keyProblem("manifest")).not.toBeNull()
    expect(keyProblem("week-40.json")).not.toBeNull()
    expect(keyProblem("week-40.JSON")).not.toBeNull()
    expect(keyProblem("a?b")).not.toBeNull()
  })
})

function intakeOk(text: string): Parameters<typeof servedBody>[0] {
  const intake = intakeLesson(text)
  if (!intake.ok) throw new Error(intake.error)
  return intake.batches
}

// The fixture is a lesson intake takes; tests above rely on it.
it("the fixture is a clean lesson", () => {
  expect(intakeOk(JSON.stringify(LESSON))).toHaveLength(1)
})
