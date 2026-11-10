import { assertNever } from "@some-ui/core-utils"
import {
  cellsOf,
  essayIntro,
  essayScenes,
  isPast,
  parseEssay,
} from "@some-ui/video-render"
import type {
  CellView,
  Essay,
  EssayDive,
  EssayScene,
  EssayTicket,
  Parsed,
  Speaker,
  Voicing,
} from "@some-ui/video-render"

import { ESSAY_WORDS as W } from "./essay-words"

/**
 * Which scene of an essay the stage shows, and what it draws: a pure read of
 * the essay's data, so the stage only renders it. An unknown scene id shows
 * the first scene, so a mistyped link opens the essay from its start.
 */

export type EssayView =
  | { readonly section: "brand-in" | "brand-out" | "open" | "next" }
  | {
      readonly section: "intro"
      readonly rows: ReturnType<typeof essayIntro>["rows"]
    }
  | {
      readonly section: "chapter"
      readonly title: string
      /** For a ticket's chapter: which ticket it is, from 1, of how many. */
      readonly ticket?: { readonly n: number; readonly of: number }
    }
  | {
      readonly section: "question" | "answer" | "best" | "beside"
      readonly ticket: EssayTicket
    }
  | {
      readonly section: "dive"
      readonly ticket: EssayTicket
      readonly dive: EssayDive
      /** Which of the ticket's deep dives it is, from 1. */
      readonly n: number
      /** Whether it goes past the ticket, on a point the answer covered. */
      readonly past: boolean
    }
  | {
      readonly section: "weeks"
      readonly rows: ReadonlyArray<{
        readonly name: string
        readonly cells: ReadonlyArray<CellView>
      }>
    }

export type EssayAt = {
  readonly scenes: ReadonlyArray<EssayScene>
  readonly index: number
  readonly scene: EssayScene
  /** Whose bubble is lit, on a scene that draws the two. */
  readonly speaker: Speaker
  readonly view: EssayView
}

const ticketOf = (essay: Essay, id: string | undefined): EssayTicket => {
  const found = essay.tickets.find((ticket) => ticket.id === id)
  if (found === undefined) throw new Error(`no ticket ${String(id)}`)
  return found
}

function viewOf(essay: Essay, scene: EssayScene, voicing: Voicing): EssayView {
  switch (scene.section) {
    case "brand-in":
    case "brand-out":
    case "open":
    case "next": {
      return { section: scene.section }
    }
    case "intro": {
      return { section: "intro", rows: essayIntro(essay, voicing).rows }
    }
    case "chapter": {
      const n = essay.tickets.findIndex((t) => t.id === scene.ticket)
      return {
        section: "chapter",
        title: scene.title,
        ...(n === -1 ? {} : { ticket: { n: n + 1, of: essay.tickets.length } }),
      }
    }
    case "question":
    case "answer":
    case "best":
    case "beside": {
      return { section: scene.section, ticket: ticketOf(essay, scene.ticket) }
    }
    case "dive": {
      const ticket = ticketOf(essay, scene.ticket)
      const k = scene.dive ?? 0
      const dive = ticket.dives.at(k)
      if (dive === undefined) throw new Error(`no deep dive ${scene.id}`)
      return {
        section: "dive",
        ticket,
        dive,
        n: k + 1,
        past: isPast(ticket, dive),
      }
    }
    case "weeks": {
      return {
        section: "weeks",
        rows: essay.weeks.concepts.map((concept) => ({
          name: concept.name,
          cells: cellsOf(concept.cells),
        })),
      }
    }
    default: {
      return assertNever(scene)
    }
  }
}

/**
 * Scene `id` of the essay, or its first scene when it has none by that id;
 * the sample's intro says whose voice reads its answers (`Voicing`).
 */
export function essayAt(
  essay: Essay,
  id: string | undefined,
  voicing: Voicing = "owner"
): EssayAt {
  const scenes = essayScenes(essay, voicing)
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === id)
  )
  // `essayScenes` always gives the intro, the open and the close.
  const scene = scenes[index]
  return {
    scenes,
    index,
    scene,
    speaker: scene.speaker,
    view: viewOf(essay, scene, voicing),
  }
}

/** What the essay's stage draws: an essay, nothing yet, or why it can't. */
export type EssayStageState =
  | { readonly kind: "waiting" }
  | { readonly kind: "show"; readonly essay: Essay; readonly voicing: Voicing }
  | { readonly kind: "none"; readonly problems: ReadonlyArray<string> }

/**
 * What the stage draws from its read (RR16): with a week named, that week's
 * essay, as read, or why it can't, never the sample in its place, so a
 * recording of a week fails instead of drawing someone else's; with none, or
 * `sample`, the template's sample, voiced as one.
 */
export function essayStageOf(input: {
  readonly week: string | undefined
  /** The named essay's file as read, parsed here. */
  readonly read: {
    readonly data: unknown
    readonly pending: boolean
    readonly failed: boolean
  }
  readonly sample: Parsed<Essay>
}): EssayStageState {
  const { week, read } = input
  if (week === undefined || week === "sample")
    return input.sample.ok
      ? { kind: "show", essay: input.sample.value, voicing: "sample" }
      : { kind: "none", problems: input.sample.problems }
  if (read.pending) return { kind: "waiting" }
  if (read.failed || read.data === undefined)
    return { kind: "none", problems: [W.unread(week)] }
  const parsed = parseEssay(read.data)
  if (!parsed.ok) return { kind: "none", problems: parsed.problems }
  if (parsed.value.week.id !== week)
    return {
      kind: "none",
      problems: [W.otherWeek(week, parsed.value.week.id)],
    }
  return { kind: "show", essay: parsed.value, voicing: "owner" }
}
