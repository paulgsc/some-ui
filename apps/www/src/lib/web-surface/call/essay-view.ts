import { assertNever } from "@some-ui/core-utils"
import { cellsOf, essayIntro, essayScenes, isPast } from "@some-ui/video-render"
import type {
  CellView,
  Essay,
  EssayDive,
  EssayScene,
  EssayTicket,
  Speaker,
} from "@some-ui/video-render"

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

function viewOf(essay: Essay, scene: EssayScene): EssayView {
  switch (scene.section) {
    case "brand-in":
    case "brand-out":
    case "open":
    case "next": {
      return { section: scene.section }
    }
    case "intro": {
      return { section: "intro", rows: essayIntro(essay).rows }
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

/** Scene `id` of the essay, or its first scene when it has none by that id. */
export function essayAt(essay: Essay, id: string | undefined): EssayAt {
  const scenes = essayScenes(essay)
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
    view: viewOf(essay, scene),
  }
}
