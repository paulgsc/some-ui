import { assertNever } from "@some-ui/core-utils"
import { gameEssayIntro, gameEssayScenes } from "@some-ui/video-render"
import type {
  GameEssay,
  GameEssayScene,
  Speaker,
  Voicing,
} from "@some-ui/video-render"

/**
 * Which scene of a Game Week essay the stage shows, and what it draws: a
 * pure read of the essay's data, as `./interview-essay-view` is the
 * interview essay's. An unknown scene id shows the first scene.
 */

type Game = GameEssay["games"][number]
type Bite = Game["halves"][number]["bites"][number]
type Still = NonNullable<Bite["play"]>["still"]

type GameEssayView =
  | { readonly section: "brand-in" | "brand-out" | "open" | "close" }
  | {
      readonly section: "intro"
      readonly rows: ReturnType<typeof gameEssayIntro>["rows"]
    }
  | { readonly section: "chapter"; readonly title: string }
  | { readonly section: "game" | "halftime"; readonly game: Game }
  | {
      readonly section: "setup" | "bite" | "happened" | "answer"
      readonly game: Game
      readonly bite: Bite
    }

export type GameEssayAt = {
  readonly scenes: ReadonlyArray<GameEssayScene>
  readonly index: number
  readonly scene: GameEssayScene
  readonly speaker: Speaker
  readonly view: GameEssayView
}

const gameOf = (essay: GameEssay, id: string | undefined): Game => {
  const game = essay.games.find((g) => g.id === id)
  if (game === undefined) throw new Error(`no game ${String(id)}`)
  return game
}

function viewOf(
  essay: GameEssay,
  scene: GameEssayScene,
  voicing: Voicing
): GameEssayView {
  switch (scene.section) {
    case "brand-in":
    case "brand-out":
    case "open":
    case "close": {
      return { section: scene.section }
    }
    case "intro": {
      return { section: "intro", rows: gameEssayIntro(essay, voicing).rows }
    }
    case "chapter": {
      return { section: "chapter", title: scene.title }
    }
    case "game":
    case "halftime": {
      return { section: scene.section, game: gameOf(essay, scene.game) }
    }
    case "setup":
    case "bite":
    case "happened":
    case "answer": {
      const game = gameOf(essay, scene.game)
      const bite = game.halves
        .flatMap((half) => half.bites)
        .find((b) => b.take === scene.take)
      if (bite === undefined) throw new Error(`no bite ${String(scene.take)}`)
      return { section: scene.section, game, bite }
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** Scene `id` of the essay, or its first scene when it has none by that id. */
export function gameEssayAt(
  essay: GameEssay,
  id: string | undefined,
  voicing: Voicing = "owner"
): GameEssayAt {
  const scenes = gameEssayScenes(essay, voicing)
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === id)
  )
  const scene = scenes[index]
  return {
    scenes,
    index,
    scene,
    speaker: scene.speaker,
    view: viewOf(essay, scene, voicing),
  }
}

/**
 * Where a still's ball and line to gain stand, in yards from the offense's
 * own goal line (0 to 100), so the field is drawn with the offense going
 * left to right; null without a spot or the team with the ball.
 */
export function fieldOf(
  still: Still
): { readonly ball: number; readonly gain: number | null } | null {
  const { spot, possession, distance } = still
  if (spot === undefined || possession === undefined) return null
  const ball = spot.side === possession ? spot.yard : 100 - spot.yard
  return {
    ball,
    gain: distance === undefined ? null : Math.min(100, ball + distance),
  }
}
