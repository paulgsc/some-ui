/** @vitest-environment node */
import type { CarryPlan, JournalRows } from "@soundbites/lib/journal/carry"
import {
  carriedProject,
  planCarry,
  upgraded,
} from "@soundbites/lib/journal/carry"
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

/** The journal's stores as rows, `takes` and `audio` keyed by cut id. */
function rows(
  fields: Partial<JournalRows> & {
    takeValues?: Record<string, unknown>
    audioValues?: Record<string, unknown>
  } = {}
): JournalRows {
  const takeValues = fields.takeValues ?? {
    gap: take("gap", 21_000),
    next: take("next", 9_000),
  }
  const audioValues = fields.audioValues ?? {
    gap: new Blob(["gap"]),
    next: new Blob(["next"]),
  }
  return {
    plan: "plan" in fields ? fields.plan : PLAN,
    takes: Object.entries(takeValues).map(([key, value]) => ({ key, value })),
    audio: Object.entries(audioValues).map(([key, value]) => ({ key, value })),
    projects: fields.projects ?? [],
  }
}

/** The stores once `plan` is carried out, as `carryJournal` does: emptied. */
function after(before: JournalRows, plan: CarryPlan): JournalRows {
  return {
    plan: undefined,
    takes: [],
    audio: [],
    projects:
      plan.kind === "carry"
        ? [...before.projects, plan.project.id]
        : before.projects,
  }
}

describe("the plan for carrying the Journal tab's episode", () => {
  it("moves every take and its recording, and leaves nothing behind", () => {
    const plan = planCarry(rows(), CARRIED)
    if (plan.kind !== "carry") throw new Error(plan.kind)
    expect(plan.moves.map((each) => [each.from, each.to])).toEqual([
      ["gap", `${plan.project.id}:t1`],
      ["next", `${plan.project.id}:t2`],
    ])
    expect(plan.takeRows).toEqual(["gap", "next"])
    expect(plan.audioRows).toEqual(["gap", "next"])
    expect(plan.project.takes.every((each) => each.onPhone)).toBe(true)
  })

  it("is nothing with no episode kept", () => {
    expect(planCarry(rows({ plan: undefined }), CARRIED)).toEqual({
      kind: "nothing",
    })
  })

  it("carries nothing when the plan can't be read", () => {
    expect(planCarry(rows({ plan: { primer: "?" } }), CARRIED)).toEqual({
      kind: "unread",
    })
  })

  it("counts a take row it can't read as left, and carries the rest", () => {
    const plan = planCarry(
      rows({
        takeValues: {
          gap: take("gap", 21_000),
          next: { cutId: "next", durationMs: "nine seconds" },
        },
      }),
      CARRIED
    )
    if (plan.kind !== "carry") throw new Error(plan.kind)
    expect(plan.project.takes.map((each) => each.shot)).toEqual(["gap"])
    expect(plan.takeRows).toEqual(["gap"])
    // Neither the unread row nor its recording is copied.
    expect(plan.audioRows).toEqual(["gap"])
  })

  it("carries a take whose recording is missing as off the phone", () => {
    const plan = planCarry(
      rows({ audioValues: { gap: new Blob(["gap"]) } }),
      CARRIED
    )
    if (plan.kind !== "carry") throw new Error(plan.kind)
    expect(plan.project.takes.map((each) => [each.shot, each.onPhone])).toEqual(
      [
        ["gap", true],
        ["next", false],
      ]
    )
    expect(plan.audioRows).toEqual(["gap"])
  })

  it("copies only audio that is a recording a carried take names", () => {
    const plan = planCarry(
      rows({
        audioValues: {
          gap: new Blob(["gap"]),
          next: "not a recording",
          stray: new Blob(["no take names this"]),
        },
      }),
      CARRIED
    )
    if (plan.kind !== "carry") throw new Error(plan.kind)
    expect(plan.moves.map((each) => each.from)).toEqual(["gap"])
    expect(plan.audioRows).toEqual(["gap"])
    // A take whose audio row isn't a recording isn't carried either.
    expect(plan.project.takes.map((each) => each.shot)).toEqual(["gap"])
    expect(plan.takeRows).toEqual(["gap"])
    expect(plan.gone).toBe(0)
  })

  it("counts the takes whose recording was already gone", () => {
    const plan = planCarry(
      rows({ audioValues: { gap: new Blob(["gap"]) } }),
      CARRIED
    )
    if (plan.kind !== "carry") throw new Error(plan.kind)
    expect(plan.gone).toBe(1)
  })

  it("carries nothing of a plan it can't fully read", () => {
    const broken = [
      { ...PLAN, targets: null },
      { ...PLAN, primer: { ...PRIMER, title: 7 } },
      { ...PLAN, primer: { ...PRIMER, cuts: [{ id: "gap" }] } },
      { ...PLAN, targets: { flow: "long" } },
      { ...PLAN, openedAt: 12 },
    ]
    for (const plan of broken)
      expect(planCarry(rows({ plan }), CARRIED)).toEqual({ kind: "unread" })
  })

  it("carries nothing when its project is kept already", () => {
    const first = planCarry(rows(), CARRIED)
    if (first.kind !== "carry") throw new Error(first.kind)
    expect(planCarry(rows({ projects: [first.project.id] }), CARRIED)).toEqual({
      kind: "unread",
    })
  })

  it("run twice, carries once: the second finds nothing to carry", () => {
    const before = rows({
      takeValues: {
        gap: take("gap", 21_000),
        next: { cutId: "next" },
      },
    })
    const once = planCarry(before, CARRIED)
    expect(planCarry(after(before, once), CARRIED)).toEqual({ kind: "nothing" })
  })
})
