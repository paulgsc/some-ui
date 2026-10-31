/**
 * The Journal tab's one episode, carried into a Studio project. Before
 * Studio, the phone kept one primer (`plan`) and one take per cut, each take's
 * audio under its cut's id (`db.ts`'s `plan`, `takes` and `audio` stores).
 * `carriedProject` reads what those held as a project: the primer as
 * revision 1, with any target the person moved, and every take as the chosen
 * take of its scene, fitted to it in revision 2. `planCarry` decides, from
 * the rows one transaction read, what moves and what stays; `carryJournal`
 * (`project/store.ts`) carries that plan out in the same transaction, so the
 * episode is in exactly one place at every moment. What a carry leaves, or
 * an episode whose plan can't be read, the store lets go in that
 * transaction (`letGo`; owner, 2026-10-30, #2251); an episode that `stays`
 * is left untouched.
 */
import { assertNever } from "@some-ui/core-utils"
import { projectAudioKey } from "@soundbites/lib/journal/db"
import type { Cut, Primer } from "@soundbites/lib/journal/primer"
import { cutV1 } from "@soundbites/lib/journal/primer"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import type { Project } from "@soundbites/lib/project/model"
import { step } from "@soundbites/lib/project/model"
import {
  fitted,
  projectFromPrimer,
  projectIdFor,
} from "@soundbites/lib/project/script"

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

type Fields = Readonly<Record<string, unknown>>

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== ""

const isMs = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

/** A cut as either primer version kept it. */
function isKeptCut(cut: unknown): boolean {
  if (!isFields(cut) || !isText(cut.id) || !isText(cut.artifact)) return false
  if (!isMs(cut.targetMs) || !isText(cut.prompt)) return false
  if (!("voice" in cut)) return true
  return (
    isText(cut.point) &&
    (cut.line === null || isText(cut.line)) &&
    Array.isArray(cut.keep) &&
    cut.keep.every(isText) &&
    (cut.voice === "ad-lib" || cut.voice === "read")
  )
}

/**
 * Only the Journal tab wrote these stores, but a row of any other shape is
 * left where it is rather than read wrong: every field the carry reads is
 * checked here.
 */
function isPlan(row: unknown): row is KeptPlan {
  if (!isFields(row) || !isText(row.openedAt)) return false
  const { primer, targets } = row
  return (
    isFields(primer) &&
    isText(primer.title) &&
    isMs(primer.budgetMs) &&
    (primer.voice === undefined ||
      primer.voice === "ad-lib" ||
      primer.voice === "read" ||
      primer.voice === "mixed") &&
    Array.isArray(primer.cuts) &&
    primer.cuts.length > 0 &&
    primer.cuts.every(isKeptCut) &&
    isFields(targets) &&
    Object.values(targets).every(isMs)
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
    !Number.isNaN(Date.parse(row.recordedAt)) &&
    "durationMs" in row &&
    isMs(row.durationMs) &&
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
  const first = projectFromPrimer(id, primer, plan.openedAt)
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
 * (`project/store.ts`) only carries it out. A take row it can't read, a
 * take whose audio row is there but isn't a recording, and audio no carried
 * take names are not copied; the store lets them go with the rows it copied.
 */
export type CarryPlan =
  /** No episode is kept: nothing to do. */
  | { readonly kind: "nothing" }
  /** An episode is kept, but its plan can't be read: the store lets it go. */
  | { readonly kind: "unread" }
  /**
   * An episode Studio can read but can't carry (a project of its id is kept
   * already, or what it makes isn't a project the file reads back): it stays
   * where it is, untouched, since its recordings may be good.
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
      /** Takes carried whose recording was already gone from the phone. */
      readonly gone: number
    }

export function planCarry(rows: JournalRows, at: string): CarryPlan {
  if (rows.plan === undefined) return { kind: "nothing" }
  if (!isPlan(rows.plan)) return { kind: "unread" }
  const audioAt = (cutId: string): Row | undefined =>
    rows.audio.find((row) => row.key === cutId)
  // A take is carried only with its recording, or with none there at all: a
  // row there that isn't a recording keeps its take beside it, unread.
  const readable = rows.takes.filter(
    (row): row is { key: IDBValidKey; value: JournalTake } => {
      if (!isTake(row.value) || row.key !== row.value.cutId) return false
      const audio = audioAt(row.value.cutId)
      return audio === undefined || audio.value instanceof Blob
    }
  )
  const { project, audio } = carriedProject(
    rows.plan,
    readable.map((row) => row.value),
    at
  )
  if (rows.projects.includes(project.id)) return { kind: "stays" }
  const moves = audio.flatMap((each) => {
    const row = audioAt(each.cutId)
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
    // A take whose recording was already gone is carried as off the phone.
    takes: project.takes.map((take) =>
      audio.some((each) => each.take === take.id && moved.has(each.cutId))
        ? take
        : { ...take, onPhone: false }
    ),
  }
  if (!readProjectFile(projectFile(carried)).ok) return { kind: "stays" }
  return {
    kind: "carry",
    project: carried,
    moves,
    takeRows: readable.map((row) => row.key),
    audioRows: [...moved],
    gone: carried.takes.filter((take) => !take.onPhone).length,
  }
}

/**
 * How many of the `held` rows of the Journal tab's stores carrying out
 * `plan` lets go: every row it doesn't copy, or none when the episode stays.
 */
export function letGo(plan: CarryPlan, held: number): number {
  switch (plan.kind) {
    case "stays": {
      return 0
    }
    case "carry": {
      return held - 1 - plan.takeRows.length - plan.audioRows.length
    }
    case "nothing":
    case "unread": {
      return held
    }
    default: {
      return assertNever(plan)
    }
  }
}
