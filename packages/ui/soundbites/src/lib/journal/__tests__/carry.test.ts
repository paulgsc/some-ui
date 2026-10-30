/** @vitest-environment node */
import { carriedProject, upgraded } from "@soundbites/lib/journal/carry"
import type { Primer } from "@soundbites/lib/journal/primer"
import { cutV1 } from "@soundbites/lib/journal/primer"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { latest, primerAt } from "@soundbites/lib/project/model"
import { TAIL_MS } from "@soundbites/lib/project/script"
import { describe, expect, it } from "vitest"

const OPENED = "2026-10-12T12:00:00.000Z"
const CARRIED = "2026-10-30T09:00:00.000Z"

const PRIMER: Primer = {
  title: "AMO release notes",
  budgetMs: 180_000,
  voice: "read",
  cuts: [
    cutV1({
      id: "gap",
      artifact: "Old notes",
      prompt: "What was missed?",
      targetMs: 30_000,
    }),
    cutV1({
      id: "flow",
      artifact: "New flow",
      prompt: "Walk it.",
      targetMs: 60_000,
    }),
    cutV1({
      id: "next",
      artifact: "End card",
      prompt: "What's next?",
      targetMs: 20_000,
    }),
  ],
}

const PLAN = {
  primer: PRIMER,
  targets: { flow: 45_000 },
  openedAt: OPENED,
  touchedAt: OPENED,
}

function take(
  cutId: string,
  durationMs: number
): {
  cutId: string
  recordedAt: string
  durationMs: number
  mimeType: string
} {
  return {
    cutId,
    recordedAt: "2026-10-12T13:00:00.000Z",
    durationMs,
    mimeType: "audio/webm;codecs=opus",
  }
}

describe("a plan kept before primer version 2", () => {
  it("opens with its cuts read as the version 1 cuts they were", () => {
    // As the phone stored it: cuts with only a prompt, no voice anywhere.
    const before = {
      ...PLAN,
      primer: {
        title: PRIMER.title,
        budgetMs: PRIMER.budgetMs,
        cuts: PRIMER.cuts.map(({ id, artifact, prompt, targetMs }) => ({
          id,
          artifact,
          prompt,
          targetMs,
        })),
      },
    }
    expect(upgraded(before).primer).toEqual(PRIMER)
  })

  it("leaves a plan from version 2 as it is", () => {
    expect(upgraded(PLAN)).toEqual(PLAN)
  })
})

describe("the Journal tab's episode, carried", () => {
  it("is the primer as revision 1, with the targets the person moved", () => {
    const { project } = carriedProject(PLAN, [], CARRIED)
    expect(project.revisions).toHaveLength(1)
    const first = project.revisions[0]!
    expect(first).toMatchObject({ rev: 1, author: "claude", at: OPENED })
    expect(first.cutList.shots.map((shot) => shot.durationMs)).toEqual([
      30_000, 45_000, 20_000,
    ])
    expect(primerAt(project, 1)?.cuts[1]?.targetMs).toBe(45_000)
    expect(project.id).toBe("amo-release-notes-20261012T120000000Z")
  })

  it("keeps every take, each chosen for its scene and the scene fitted to it", () => {
    const { project, audio } = carriedProject(
      PLAN,
      [take("next", 9_000), take("gap", 21_000.4)],
      CARRIED
    )
    expect(project.takes.map((each) => [each.id, each.shot])).toEqual([
      ["t1", "gap"],
      ["t2", "next"],
    ])
    expect(project.takes[0]).toMatchObject({
      durationMs: 21_000,
      keptBy: [],
      onPhone: true,
    })
    expect(project.chosen).toEqual({ gap: "t1", next: "t2" })
    expect(audio).toEqual([
      { cutId: "gap", take: "t1" },
      { cutId: "next", take: "t2" },
    ])
    const fitted = latest(project)
    expect(fitted).toMatchObject({ rev: 2, author: "owner", at: CARRIED })
    expect(fitted.cutList.shots[0]).toMatchObject({
      durationMs: 200 + 21_000 + TAIL_MS,
      take: { file: "gap-t1.webm", inMs: 0, outMs: 21_000 },
    })
    // The scene with no take keeps its moved target.
    expect(fitted.cutList.shots[1]?.durationMs).toBe(45_000)
  })

  it("carries a take its primer has no cut for, chosen for nothing", () => {
    const { project } = carriedProject(PLAN, [take("gone", 5_000)], CARRIED)
    expect(project.takes).toHaveLength(1)
    expect(project.chosen).toEqual({})
    expect(project.revisions).toHaveLength(1)
  })

  it("reads back from its project file", () => {
    const { project } = carriedProject(
      PLAN,
      [take("gap", 21_000), take("flow", 40_000)],
      CARRIED
    )
    expect(readProjectFile(projectFile(project))).toEqual({
      ok: true,
      value: project,
    })
  })
})
