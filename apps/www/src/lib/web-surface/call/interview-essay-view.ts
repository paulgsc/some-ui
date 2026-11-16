import { assertNever } from "@some-ui/core-utils"
import {
  interviewEssayIntro,
  interviewEssayScenes,
} from "@some-ui/video-render"
import type {
  InterviewEssay,
  InterviewEssayScene,
  InterviewQuestion,
  InterviewRead,
  Speaker,
  Voicing,
} from "@some-ui/video-render"

/**
 * Which scene of an interview essay the stage shows, and what it draws: a
 * pure read of the essay's data, as `./essay-view` is the Rust essay's. An
 * unknown scene id shows the first scene.
 */

type InterviewEssayView =
  | { readonly section: "brand-in" | "brand-out" | "open" | "weeks" | "next" }
  | {
      readonly section: "intro"
      readonly rows: ReturnType<typeof interviewEssayIntro>["rows"]
    }
  | { readonly section: "chapter"; readonly title: string }
  | {
      readonly section: "question" | "answer" | "faults" | "model" | "beside"
      readonly question: InterviewQuestion
    }
  | {
      readonly section: "card" | "reading" | "heard"
      readonly read: InterviewRead
    }

export type InterviewEssayAt = {
  readonly scenes: ReadonlyArray<InterviewEssayScene>
  readonly index: number
  readonly scene: InterviewEssayScene
  readonly speaker: Speaker
  readonly view: InterviewEssayView
}

function viewOf(
  essay: InterviewEssay,
  scene: InterviewEssayScene,
  voicing: Voicing
): InterviewEssayView {
  switch (scene.section) {
    case "brand-in":
    case "brand-out":
    case "open":
    case "weeks":
    case "next": {
      return { section: scene.section }
    }
    case "intro": {
      return {
        section: "intro",
        rows: interviewEssayIntro(essay, voicing).rows,
      }
    }
    case "chapter": {
      return { section: "chapter", title: scene.title }
    }
    case "question":
    case "answer":
    case "faults":
    case "model":
    case "beside": {
      const question = essay.questions.find((q) => q.id === scene.question)
      if (question === undefined)
        throw new Error(`no question ${String(scene.question)}`)
      return { section: scene.section, question }
    }
    case "card":
    case "reading":
    case "heard": {
      const read = essay.reads.find((r) => r.id === scene.read)
      if (read === undefined) throw new Error(`no read ${String(scene.read)}`)
      return { section: scene.section, read }
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** Scene `id` of the essay, or its first scene when it has none by that id. */
export function interviewEssayAt(
  essay: InterviewEssay,
  id: string | undefined,
  voicing: Voicing = "owner"
): InterviewEssayAt {
  const scenes = interviewEssayScenes(essay, voicing)
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === id)
  )
  // `interviewEssayScenes` always gives the intro, the open and the close.
  const scene = scenes[index]
  return {
    scenes,
    index,
    scene,
    speaker: scene.speaker,
    view: viewOf(essay, scene, voicing),
  }
}
