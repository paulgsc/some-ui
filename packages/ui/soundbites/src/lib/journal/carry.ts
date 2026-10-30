/**
 * The Journal tab's one episode, carried into a Studio project. Before
 * Studio, the phone kept one primer (`plan`) and one take per cut, each take's
 * audio under its cut's id (`db.ts`'s `plan`, `takes` and `audio` stores).
 * `carriedProject` reads what those held as a project: the primer as
 * revision 1, with any target the person moved, and every take as the chosen
 * take of its scene, fitted to it in revision 2. `planCarry` decides, from
 * the rows one transaction read, what moves and what stays; `carryJournal`
 * (`project/store.ts`) carries that plan out in the same transaction, so the
 * episode is in exactly one place at every moment: nothing is let go.
 */
import { projectAudioKey } from "@soundbites/lib/journal/db"
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
function isPlan(row: unknown): row is KeptPlan {
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

function isTake(row: unknown): row is JournalTake {
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

/** A row as a store holds it: its key and whatever was written under it. */
export type Row = { readonly key: IDBValidKey; readonly value: unknown }

/** What the Journal tab's stores hold, as one transaction read them. */
export type JournalRows = {
  /** The plan store's one row, if it has one. */
  readonly plan: unknown
  readonly takes: ReadonlyArray<Row>
  readonly audio: ReadonlyArray<Row>
  /** The ids of the projects already kept. */
  readonly projects: ReadonlyArray<IDBValidKey>
}

/**
 * What carrying does, decided before anything is written: `carryJournal`
 * (`project/store.ts`) only carries it out. Nothing is deleted that was not
 * first copied into the project: a take row it can't read and audio that is
 * not a recording stay where they are, counted in `left`.
 */
export type CarryPlan =
  /** No episode is kept: nothing to do. */
  | { readonly kind: "nothing" }
  /**
   * An episode is kept but can't be carried (its plan can't be read, or a
   * project of its id is kept already): everything stays where it is.
   */
  | { readonly kind: "stays" }
  | {
      readonly kind: "carry"
      readonly project: Project
      /** Each recording, from its key in the journal's audio to its take's key. */
      readonly moves: ReadonlyArray<{
        readonly from: IDBValidKey
        readonly to: string
        readonly audio: Blob
      }>
      /** The take rows and audio rows copied into the project, to delete. */
      readonly takeRows: ReadonlyArray<IDBValidKey>
      readonly audioRows: ReadonlyArray<IDBValidKey>
      /** Rows of either store that stay, unread or uncopied. */
      readonly left: number
    }

export function planCarry(rows: JournalRows, at: string): CarryPlan {
  if (rows.plan === undefined) return { kind: "nothing" }
  if (!isPlan(rows.plan)) return { kind: "stays" }
  const readable = rows.takes.filter(
    (row): row is { key: IDBValidKey; value: JournalTake } =>
      isTake(row.value) && row.key === row.value.cutId
  )
  const { project, audio } = carriedProject(
    rows.plan,
    readable.map((row) => row.value),
    at
  )
  if (rows.projects.includes(project.id)) return { kind: "stays" }
  const moves = audio.flatMap((each) => {
    const row = rows.audio.find((one) => one.key === each.cutId)
    return row?.value instanceof Blob
      ? [
          {
            from: row.key,
            to: projectAudioKey(project.id, each.take),
            audio: row.value,
          },
        ]
      : []
  })
  const moved = new Set(moves.map((each) => each.from))
  const carried: Project = {
    ...project,
    // A take whose recording isn't there to move is carried as off the phone.
    takes: project.takes.map((take) =>
      audio.some((each) => each.take === take.id && moved.has(each.cutId))
        ? take
        : { ...take, onPhone: false }
    ),
  }
  return {
    kind: "carry",
    project: carried,
    moves,
    takeRows: readable.map((row) => row.key),
    audioRows: [...moved],
    left:
      rows.takes.length -
      readable.length +
      rows.audio.filter((row) => !moved.has(row.key)).length,
  }
}
