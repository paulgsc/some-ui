/**
 * What happens next: one state, and a pure `step` over a scene tree
 * (docs/makjang/README.md, "2. Engine: what happens next").
 *
 * The engine knows the shape and nothing else. It never asks which option is
 * the answer, whether a voice or a picture exists, or what a feeling means:
 * it names what should be presented (`DramaEffect`) and a renderer decides
 * how. Recursion is in the content: entering a child scene is pushing an
 * option id onto the route, the same at every depth.
 *
 * - Back stops at the current scene's first beat and never crosses a choice:
 *   crossing one would let the learner choose again, a retry, which the
 *   check's valuation forbids (canon Cor. 4.4).
 * - Restart replays the lesson from the root (Cor. 8.2). The first choices
 *   stay, and a choice made again on the replay records nothing new.
 * - A resume point is resolved by identity and discarded to the root when any
 *   part of it no longer resolves (Thm. 1.1).
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK1: this module imports only makjang's own schema: no media, no topik
 *   (`no-restricted-imports` in this workspace's eslint.config.js).
 * - MK3: `first[c]` is the option first chosen at choice `c`, kept across
 *   restarts, and a choice never presented has no entry (the property test in
 *   `__tests__/engine.test.ts`).
 */

import type { Beat, Lesson, Route, Scene } from "@makjang/schema"
import { isLine, isRecord, sceneAt, scenesOf } from "@makjang/schema"

/** Where the learner is inside the current scene. */
export type At =
  | { kind: "beat"; id: string }
  /** Every beat shown; the scene's choice is open. */
  | { kind: "choice" }
  /** Every beat of a leaf shown: the story has resolved. */
  | { kind: "end" }

export type DramaState = {
  route: Route
  at: At
  /** Choice id → the option first chosen there: a choice's outcome. */
  first: Readonly<Record<string, string>>
}

export type DramaEvent =
  | { type: "advance" }
  | { type: "back" }
  | { type: "choose"; option: string }
  | { type: "restart" }

export type DramaEffect =
  /** Show this scene: its place, wrapped in its feeling. */
  | { type: "enter-scene"; scene: string; place: string; feeling: string }
  /** Present this beat, as this character, or as narration (`null`). */
  | { type: "voice"; beat: string; speaker: string | null }
  /** An option was chosen; `first` says whether it is the choice's outcome. */
  | { type: "answered"; choice: string; option: string; first: boolean }
  /** Keep this as the resume point. */
  | { type: "persist"; point: DramaState }

export type Transition = { state: DramaState; effects: Array<DramaEffect> }

const voice = (beat: Beat): DramaEffect => ({
  type: "voice",
  beat: beat.id,
  speaker: isLine(beat) ? beat.speaker : null,
})

/** Where a scene's beats end: at its choice, or at the story's end. */
const afterBeats = <Check>(scene: Scene<Check>): At =>
  scene.choice ? { kind: "choice" } : { kind: "end" }

const enterScene = <Check>(scene: Scene<Check>): DramaEffect => ({
  type: "enter-scene",
  scene: scene.id,
  place: scene.place,
  feeling: scene.feeling,
})

/** Entering a scene: its first beat, or straight to what follows the beats. */
function enter<Check>(scene: Scene<Check>): {
  at: At
  effects: Array<DramaEffect>
} {
  const first = scene.beats[0]
  return {
    at: first ? { kind: "beat", id: first.id } : afterBeats(scene),
    effects: [enterScene(scene), ...(first ? [voice(first)] : [])],
  }
}

const persist = (state: DramaState): DramaEffect => ({
  type: "persist",
  point: state,
})

const unchanged = (state: DramaState): Transition => ({ state, effects: [] })

/** The beat `at` names in `scene`, by position; -1 when it names none. */
const beatIndex = <Check>(scene: Scene<Check>, at: At): number =>
  at.kind === "beat" ? scene.beats.findIndex((beat) => beat.id === at.id) : -1

/** The lesson's opening: the root's first beat, nothing chosen yet. */
export function start<Check>(lesson: Lesson<Check>): Transition {
  const opening = enter(lesson.root)
  return {
    state: { route: [], at: opening.at, first: {} },
    effects: opening.effects,
  }
}

/**
 * The next state and what to present. An event that does not apply where
 * the learner is (choosing while a beat shows, advancing at the end, an
 * option the open choice does not have) changes nothing.
 */
export function step<Check>(
  lesson: Lesson<Check>,
  state: DramaState,
  event: DramaEvent
): Transition {
  const scene = sceneAt(lesson.root, state.route)
  if (scene === undefined) return unchanged(state)

  switch (event.type) {
    case "advance": {
      const index = beatIndex(scene, state.at)
      if (index === -1) return unchanged(state)
      const next = scene.beats[index + 1]
      const moved: DramaState = {
        ...state,
        at: next ? { kind: "beat", id: next.id } : afterBeats(scene),
      }
      return {
        state: moved,
        effects: [...(next ? [voice(next)] : []), persist(moved)],
      }
    }
    case "back": {
      // From the open choice or the end, back is the scene's last beat.
      const index =
        state.at.kind === "beat"
          ? beatIndex(scene, state.at)
          : scene.beats.length
      const previous = index > 0 ? scene.beats[index - 1] : undefined
      if (previous === undefined) return unchanged(state)
      const moved: DramaState = {
        ...state,
        at: { kind: "beat", id: previous.id },
      }
      return { state: moved, effects: [voice(previous), persist(moved)] }
    }
    case "choose": {
      const choice = scene.choice
      if (state.at.kind !== "choice" || choice === undefined) {
        return unchanged(state)
      }
      const option = choice.options.find(({ id }) => id === event.option)
      if (option === undefined) return unchanged(state)
      const isFirst = !Object.hasOwn(state.first, choice.id)
      const entering = enter(option.child)
      const moved: DramaState = {
        route: [...state.route, option.id],
        at: entering.at,
        first: isFirst
          ? { ...state.first, [choice.id]: option.id }
          : state.first,
      }
      return {
        state: moved,
        effects: [
          {
            type: "answered",
            choice: choice.id,
            option: option.id,
            first: isFirst,
          },
          ...entering.effects,
          persist(moved),
        ],
      }
    }
    case "restart": {
      const opening = enter(lesson.root)
      const moved: DramaState = {
        route: [],
        at: opening.at,
        first: state.first,
      }
      return { state: moved, effects: [...opening.effects, persist(moved)] }
    }
    default: {
      return unreachable(event)
    }
  }
}

/** No runtime dependency to take `assertNever` from; this is it. */
function unreachable(value: never): never {
  throw new Error(`unhandled drama event: ${JSON.stringify(value)}`)
}

const isStringArray = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

function readAt(value: unknown): At | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === "beat") {
    return typeof value.id === "string"
      ? { kind: "beat", id: value.id }
      : undefined
  }
  if (value.kind === "choice") return { kind: "choice" }
  if (value.kind === "end") return { kind: "end" }
  return undefined
}

function readFirst(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const first: Record<string, string> = {}
  for (const [choice, option] of Object.entries(value)) {
    if (typeof option !== "string") return undefined
    first[choice] = option
  }
  return first
}

/**
 * Whether `first` could have come from this tree: each entry names a choice
 * of it and one of that choice's options, and every choice above it was
 * answered too, since nothing below a choice is reached before it is.
 */
function firstResolves<Check>(
  lesson: Lesson<Check>,
  first: Record<string, string>
): boolean {
  const choices = new Map<string, { options: Array<string>; above: Route }>()
  // The choice of each scene on a route, keyed by the route.
  const choiceAt = new Map<string, string>()
  for (const { route, scene } of scenesOf(lesson.root)) {
    if (scene.choice === undefined) continue
    choiceAt.set(route.join("\u0000"), scene.choice.id)
    choices.set(scene.choice.id, {
      options: scene.choice.options.map(({ id }) => id),
      above: route,
    })
  }
  return Object.entries(first).every(([choiceId, option]) => {
    const found = choices.get(choiceId)
    if (!found?.options.includes(option)) return false
    return found.above.every((_, depth) => {
      const parent = choiceAt.get(found.above.slice(0, depth).join("\u0000"))
      return parent !== undefined && Object.hasOwn(first, parent)
    })
  })
}

/**
 * The state a stored resume point names, or the lesson's opening when any
 * part of it no longer resolves in this tree (Thm. 1.1): a route through
 * options it no longer has, a beat no longer in the scene, an open choice on
 * a scene that has none, or a first choice it could not have recorded.
 * Losing a resume point costs a restart and nothing else.
 */
export function resume<Check>(
  lesson: Lesson<Check>,
  point: unknown
): Transition {
  if (!isRecord(point) || !isStringArray(point.route)) return start(lesson)
  const at = readAt(point.at)
  const first = readFirst(point.first)
  const route = point.route
  const scene = sceneAt(lesson.root, route)
  if (at === undefined || first === undefined || scene === undefined) {
    return start(lesson)
  }

  const beat = scene.beats[beatIndex(scene, at)]
  const atResolves =
    at.kind === "beat"
      ? beat !== undefined
      : at.kind === "choice"
        ? scene.choice !== undefined
        : scene.choice === undefined
  // Every choice the route crosses was answered on the way.
  const crossedAnswered = route.every((_, depth) => {
    const choice = sceneAt(lesson.root, route.slice(0, depth))?.choice
    return choice !== undefined && Object.hasOwn(first, choice.id)
  })
  if (!atResolves || !crossedAnswered || !firstResolves(lesson, first)) {
    return start(lesson)
  }

  return {
    state: { route: [...route], at, first },
    effects: [enterScene(scene), ...(beat ? [voice(beat)] : [])],
  }
}
