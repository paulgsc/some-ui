/**
 * The Journal tab's one episode, carried into a Studio project. Before
 * Studio, the phone kept one primer (`plan`) and one take per cut, each take's
 * audio under its cut's id (`db.ts`'s `plan`, `takes` and `audio` stores).
 * `carriedProject` reads what those held as a project: the primer as
 * revision 1, with any target the person moved, and every take as the chosen
 * take of its scene, fitted to it in revision 2. `carryJournal`
 * (`project/store.ts`) writes it and moves the audio in one transaction, so
 * the episode is in exactly one place at every moment: nothing is let go.
 */
import type { Cut, Primer } from "@soundbites/lib/journal/primer"
import { cutV1 } from "@soundbites/lib/journal/primer"
import type { Project } from "@soundbites/lib/project/model"
import { newProject, step } from "@soundbites/lib/project/model"
import { cutListOf, fitted, projectIdFor } from "@soundbites/lib/project/script"

/** The episode as the Journal tab kept it. */
type JournalPlan = {
  readonly primer: Primer
  /** Targets the person moved, by cut id. */
  readonly targets: Readonly<Record<string, number>>
  /** ISO 8601, UTC: when the primer was opened. */
  readonly openedAt: string
}

/** One cut's take, its audio stored beside it under `cutId`. */
export type JournalTake = {
  readonly cutId: string
  readonly recordedAt: string
  readonly durationMs: number
  readonly mimeType: string
}

/** A plan as kept: one from before primer version 2 has cuts with only a prompt. */
type KeptPlan = Omit<JournalPlan, "primer"> & {
  readonly primer: Omit<Primer, "voice" | "cuts"> & {
    readonly voice?: Primer["voice"]
    readonly cuts: ReadonlyArray<Cut | Parameters<typeof cutV1>[0]>
  }
}

/** Only the Journal tab wrote these stores: a guard against another shape. */
export function isPlan(row: unknown): row is KeptPlan {
  return (
    typeof row === "object" &&
    row !== null &&
    "primer" in row &&
    typeof row.primer === "object" &&
    row.primer !== null &&
    "cuts" in row.primer &&
    Array.isArray(row.primer.cuts) &&
    "targets" in row &&
    typeof row.targets === "object" &&
    "openedAt" in row &&
    typeof row.openedAt === "string"
  )
}

export function isTake(row: unknown): row is JournalTake {
  return (
    typeof row === "object" &&
    row !== null &&
    "cutId" in row &&
    typeof row.cutId === "string" &&
    "recordedAt" in row &&
    typeof row.recordedAt === "string" &&
    "durationMs" in row &&
    typeof row.durationMs === "number" &&
    "mimeType" in row &&
    typeof row.mimeType === "string"
  )
}

/**
 * A plan kept before primer version 2 holds cuts with only a prompt and no
 * voice: they read as the version 1 cuts they were.
 */
export function upgraded(plan: KeptPlan): JournalPlan {
  return {
    ...plan,
    primer: {
      ...plan.primer,
      voice: plan.primer.voice ?? "read",
      cuts: plan.primer.cuts.map((cut) => ("voice" in cut ? cut : cutV1(cut))),
    },
  }
}

export type Carried = {
  readonly project: Project
  /** Each take's audio: the cut id it is kept under now, the take it becomes. */
  readonly audio: ReadonlyArray<{
    readonly cutId: string
    readonly take: string
  }>
}

/**
 * The episode as a project, carried at `at`. A take for a cut the primer
 * lacks (one a dropped write left behind) is carried too, chosen for no
 * scene, so nothing of it is lost.
 */
export function carriedProject(
  kept: KeptPlan,
  takes: ReadonlyArray<JournalTake>,
  at: string
): Carried {
  const plan = upgraded(kept)
  const primer: Primer = {
    ...plan.primer,
    cuts: plan.primer.cuts.map((cut) => ({
      ...cut,
      targetMs: Math.round(plan.targets[cut.id] ?? cut.targetMs),
    })),
  }
  const id = projectIdFor(primer.title, plan.openedAt)
  const first = newProject(id, {
    author: "claude",
    message: `Primer: ${primer.title}`,
    at: plan.openedAt,
    cutList: cutListOf(primer),
    primer,
  })
  const order = primer.cuts.map((cut) => cut.id)
  const sorted = [...takes].sort(
    (a, b) =>
      (order.indexOf(a.cutId) + 1 || order.length + 1) -
      (order.indexOf(b.cutId) + 1 || order.length + 1)
  )
  const carried = sorted.map((take, index) => ({
    id: `t${index + 1}`,
    shot: take.cutId,
    recordedAt: take.recordedAt,
    durationMs: Math.max(1, Math.round(take.durationMs)),
    mimeType: take.mimeType,
    keptBy: [] as const,
    onPhone: true,
  }))
  const inPrimer = carried.filter((take) => order.includes(take.shot))
  const withTakes: Project = {
    ...first.project,
    takes: carried,
    chosen: Object.fromEntries(inPrimer.map((take) => [take.shot, take.id])),
  }
  const project =
    inPrimer.length === 0
      ? withTakes
      : step(
          { project: withTakes, taking: null, closing: null },
          {
            type: "revised",
            author: "owner",
            message:
              "Carried from the Journal tab, each scene fitted to its take",
            at,
            cutList: inPrimer.reduce(
              (cutList, take) => fitted(cutList, take.shot, take),
              first.project.revisions[0]!.cutList
            ),
          }
        ).state.project
  return {
    project,
    audio: sorted.map((take, index) => ({
      cutId: take.cutId,
      take: `t${index + 1}`,
    })),
  }
}
