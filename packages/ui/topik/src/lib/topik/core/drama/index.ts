/**
 * The phone's drama, as teaching state beside makjang's engine
 * (docs/makjang/README.md, "2. Engine": the ladder "lives in topik's teaching
 * state in `core/`, beside the engine's state, never in the renderer").
 *
 * A session is the engine's `DramaState` plus how far each line has climbed
 * the audio, Hangul, gloss ladder (canon Cor. 4.4). The story asks its
 * choices at the end of a scene, so no gloss is withheld while one is open:
 * every line's gloss stays one rung away (Rem. 4.12), and the choice's own
 * prompt and the cover's caption are Hangul with their English one tap away.
 *
 * `panelsOf` is what the renderer draws: one panel per beat shown, the
 * scene's cover first, the chosen line before it on a child scene, and the
 * open choice or the ending last. After an ending come the author's notes
 * (작가의 말): each choice the route made, with the line chosen and why it
 * reads as it does - how the scene resolved, never a score. Which panels wear
 * the scene's feeling is decided here, once (MK6).
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK4: the lesson here is a `checked` `TreeIntake`'s, never a raw tree.
 * - MK6: no feeling anchor sits on a choice or a chosen line: their panels,
 *   and the notes that quote chosen lines, carry no feeling.
 */

import type {
  Beat,
  DramaEffect,
  DramaEvent,
  DramaState,
  Lesson,
  Line,
  Narration,
  Scene,
} from "@some-ui/makjang"
import {
  isLine,
  resume,
  sceneAt,
  scenesOf,
  start,
  step,
} from "@some-ui/makjang"
import type { FeelingKey } from "@some-ui/styles/theme"
import { isFeelingKey } from "@some-ui/styles/theme"
import type { Probe, ProbeOption } from "@topik/lib/topik"

/** Audio only, Hangul, gloss: canon Cor. 4.4's ladder. */
export type Rung = 0 | 1 | 2

/** Where a heard line's ladder starts: at Hangul when nothing can speak. */
const firstRung = (audio: boolean): Rung => (audio ? 0 : 1)

export type DramaLesson = Lesson<Probe>

export type DramaSession = {
  drama: DramaState
  /**
   * The rung each id has reached this visit: a beat's line, a choice's
   * prompt, a scene's cover caption. Ids are unique across a tree.
   */
  rungs: Readonly<Record<string, Rung>>
  /** Choices whose chosen candidate's `why` has been opened, by choice id. */
  whys: Readonly<Record<string, true>>
  /** Whether lines can be heard. Without it the ladder starts at Hangul. */
  audio: boolean
}

export type SessionEvent =
  | DramaEvent
  | { type: "reveal"; id: string }
  /** Opens the `why` of the candidate chosen at a choice. */
  | { type: "why"; choice: string }
  /** Whether lines can be heard changed: muted, unmuted, a voice found. */
  | { type: "audible"; audible: boolean }

export type SessionTransition = {
  session: DramaSession
  effects: Array<DramaEffect>
}

const indexed = new WeakMap<DramaLesson, ReadonlyMap<string, Beat>>()

/** Every beat of the tree, by id. */
export function beatsOf(lesson: DramaLesson): ReadonlyMap<string, Beat> {
  let beats = indexed.get(lesson)
  if (beats === undefined) {
    beats = new Map(
      scenesOf(lesson.root).flatMap(({ scene }) =>
        scene.beats.map((beat): [string, Beat] => [beat.id, beat])
      )
    )
    indexed.set(lesson, beats)
  }
  return beats
}

/**
 * Where `id` stands on its ladder. Only a beat is heard first; a prompt or a
 * caption starts at its Hangul.
 */
export function rungOf(
  lesson: DramaLesson,
  session: DramaSession,
  id: string
): Rung {
  const reached = session.rungs[id]
  if (reached !== undefined) return reached
  return beatsOf(lesson).has(id) ? firstRung(session.audio) : 1
}

/**
 * The lesson's opening, or where `point` left it when it still resolves in
 * this tree (the engine's `resume`; Thm. 1.1).
 */
export function openSession(
  lesson: DramaLesson,
  audio: boolean,
  point?: unknown
): SessionTransition {
  const opened = point === undefined ? start(lesson) : resume(lesson, point)
  return {
    session: readSilently(lesson, {
      drama: opened.state,
      rungs: {},
      whys: {},
      audio,
    }),
    effects: opened.effects,
  }
}

export function stepSession(
  lesson: DramaLesson,
  session: DramaSession,
  event: SessionEvent
): SessionTransition {
  if (event.type === "audible") {
    if (event.audible === session.audio) return { session, effects: [] }
    // Falling silent shows the scene's beats at Hangul; they stay read.
    return {
      session: event.audible
        ? { ...session, audio: true }
        : readSilently(
            lesson,
            { ...session, audio: false },
            shownBeats(sceneOf(lesson, session), session)
          ),
      effects: [],
    }
  }
  if (event.type === "why") {
    return Object.hasOwn(session.whys, event.choice)
      ? { session, effects: [] }
      : {
          session: {
            ...session,
            whys: { ...session.whys, [event.choice]: true },
          },
          effects: [],
        }
  }
  if (event.type === "reveal") {
    const rung = rungOf(lesson, session, event.id)
    if (rung === 2) return { session, effects: [] }
    return {
      session: {
        ...session,
        rungs: { ...session.rungs, [event.id]: rung === 0 ? 1 : 2 },
      },
      effects: [],
    }
  }
  const moved = step(lesson, session.drama, event)
  return moved.state === session.drama
    ? { session, effects: moved.effects }
    : {
        session: readSilently(lesson, { ...session, drama: moved.state }),
        effects: moved.effects,
      }
}

/**
 * While nothing can be heard, a beat is shown at its Hangul; recording that
 * keeps it there once sound returns, since a rung never goes back. `beats`
 * defaults to the beat on screen.
 */
function readSilently(
  lesson: DramaLesson,
  session: DramaSession,
  beats: ReadonlyArray<Beat> = currentBeat(lesson, session)
): DramaSession {
  if (session.audio || beats.length === 0) return session
  return {
    ...session,
    rungs: {
      ...session.rungs,
      ...Object.fromEntries(
        beats.map((beat): [string, Rung] => [
          beat.id,
          session.rungs[beat.id] ?? firstRung(false),
        ])
      ),
    },
  }
}

const currentBeat = (
  lesson: DramaLesson,
  session: DramaSession
): Array<Beat> => {
  const { at } = session.drama
  const beat = at.kind === "beat" ? beatsOf(lesson).get(at.id) : undefined
  return beat ? [beat] : []
}

// ── What the renderer draws ─────────────────────────────────────────────────

/** The option chosen to reach the current scene, as the POV says it. */
type ChosenLine = {
  /** The choice it answered. */
  choice: string
  candidate: ProbeOption
}

/** A choice the route made, as the author's notes give it. */
type Note = ChosenLine & {
  /** The choice's prompt, in Korean. */
  prompt: string
}

export type Panel =
  | { kind: "chosen"; id: string; chosen: ChosenLine; speaker: string }
  | {
      kind: "cover"
      id: string
      scene: Scene<Probe>
      feeling: FeelingKey
    }
  | { kind: "line"; id: string; line: Line; feeling: FeelingKey }
  | { kind: "narration"; id: string; narration: Narration; feeling: FeelingKey }
  | { kind: "choice"; id: string; scene: Scene<Probe> }
  | {
      kind: "ending"
      id: string
      scene: Scene<Probe>
      feeling: FeelingKey
    }
  | { kind: "notes"; id: string; notes: Array<Note> }

/** The current scene: the engine's route, resolved. */
export const sceneOf = (
  lesson: DramaLesson,
  session: DramaSession
): Scene<Probe> => sceneAt(lesson.root, session.drama.route) ?? lesson.root

/** The line the learner chose that led here; none at the root. */
function chosenLineOf(
  lesson: DramaLesson,
  session: DramaSession
): ChosenLine | undefined {
  const { route } = session.drama
  const last = route[route.length - 1]
  const choice = sceneAt(lesson.root, route.slice(0, -1))?.choice
  const candidate = choice?.check.options.find(({ id }) => id === last)
  if (choice === undefined || candidate === undefined) return undefined
  return { choice: choice.id, candidate }
}

/** Every choice on the route, in order, with the option it took. */
function notesOf(lesson: DramaLesson, session: DramaSession): Array<Note> {
  const { route } = session.drama
  return route.flatMap((option, depth): Array<Note> => {
    const choice = sceneAt(lesson.root, route.slice(0, depth))?.choice
    const candidate = choice?.check.options.find(({ id }) => id === option)
    return choice && candidate
      ? [{ choice: choice.id, prompt: choice.prompt, candidate }]
      : []
  })
}

/** The beats shown so far in `scene`: up to the current one, or all. */
function shownBeats(scene: Scene<Probe>, session: DramaSession): Array<Beat> {
  const { at } = session.drama
  if (at.kind !== "beat") return scene.beats
  const index = scene.beats.findIndex((beat) => beat.id === at.id)
  return scene.beats.slice(0, index + 1)
}

/** The current scene's panels, top to bottom (MK6). */
export function panelsOf(
  lesson: DramaLesson,
  session: DramaSession
): Array<Panel> {
  const scene = sceneOf(lesson, session)
  // The audit rejects a tree whose scene names a feeling the renderer does
  // not have (MK4), so this never falls back in a lesson that plays.
  const feeling: FeelingKey = isFeelingKey(scene.feeling)
    ? scene.feeling
    : "tension"
  const panels: Array<Panel> = []
  const chosen = chosenLineOf(lesson, session)
  if (chosen) {
    panels.push({
      kind: "chosen",
      id: `${chosen.choice}:${chosen.candidate.id ?? ""}`,
      chosen,
      speaker: lesson.pov,
    })
  }
  panels.push({ kind: "cover", id: `${scene.id}:cover`, scene, feeling })
  for (const beat of shownBeats(scene, session)) {
    panels.push(
      isLine(beat)
        ? { kind: "line", id: beat.id, line: beat, feeling }
        : { kind: "narration", id: beat.id, narration: beat, feeling }
    )
  }
  const { at } = session.drama
  if (at.kind === "choice") {
    panels.push({ kind: "choice", id: `${scene.id}:choice`, scene })
  } else if (at.kind === "end") {
    panels.push({ kind: "ending", id: `${scene.id}:end`, scene, feeling })
    const notes = notesOf(lesson, session)
    if (notes.length > 0) {
      panels.push({ kind: "notes", id: `${scene.id}:notes`, notes })
    }
  }
  return panels
}

/** Whether `back` would move: false at a scene's first beat. */
export function canGoBack(lesson: DramaLesson, session: DramaSession): boolean {
  const { at } = session.drama
  if (at.kind !== "beat") return sceneOf(lesson, session).beats.length > 0
  return sceneOf(lesson, session).beats[0]?.id !== at.id
}
