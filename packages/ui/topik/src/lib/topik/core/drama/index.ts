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
 * `panelsOf` is what the renderer draws, top to bottom: each scene the route
 * passed, read-only, so the route stays the reader's memory as well as the
 * engine's; then the current scene. A child scene opens on the chosen line,
 * as the POV says it (or, for an odd-one-out, bites it back), then its first
 * beat, the other side's answer, and only then its cover: the Korean answers
 * the choice before the feeling does. The open choice is asked last, or the
 * ending closes on the leaf's last beat and then the author's notes
 * (작가의 말), which tell each choice as what happened, its `why` a tap
 * further - never a score. Which panels wear the scene's feeling is decided
 * here, once (MK6).
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK4: the lesson here is a `checked` `TreeIntake`'s, never a raw tree.
 * - MK6: no feeling anchor sits on a choice or a chosen line: their panels,
 *   the passed scenes and the notes that quote chosen lines carry no
 *   feeling, nor does the beat that answers a chosen line, before the cover
 *   (or, on a one-beat leaf, the ending).
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
import { bitesBack } from "@topik/lib/topik/core/probe"
import type { Probe, ProbeOption } from "@topik/lib/topik/entity/topik-types"

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
  /**
   * The candidates whose `why` has been opened this visit, per choice:
   * opening one never opens another's.
   */
  whys: Readonly<Record<string, Readonly<Record<string, true>>>>
  /** Whether lines can be heard. Without it the ladder starts at Hangul. */
  audio: boolean
  /** Opened at a kept place past the root, and not moved since. */
  resumed: boolean
}

export type SessionEvent =
  | DramaEvent
  | { type: "reveal"; id: string }
  /** Opens the `why` of `option`, the candidate chosen at `choice`. */
  | { type: "why"; choice: string; option: string }
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

/** The drama's title: its own, else its root scene's place. */
export const titleOf = (lesson: DramaLesson): string =>
  lesson.title ?? lesson.root.place

/**
 * A scene named as a moment, for the review's chips: its title, else its
 * first beat's words. Two scenes in one place, in one feeling, still differ
 * here.
 */
export function momentOf(
  lesson: DramaLesson,
  sceneId: string
): string | undefined {
  const scene = scenesOf(lesson.root).find(
    ({ scene: { id } }) => id === sceneId
  )?.scene
  return scene?.title ?? scene?.beats[0]?.text.trim()
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

/** The candidates opened at `choice`: an own entry only, any id allowed. */
const openedAt = (
  session: DramaSession,
  choice: string
): Readonly<Record<string, true>> | undefined =>
  Object.hasOwn(session.whys, choice) ? session.whys[choice] : undefined

/** Whether the `why` of `option`, chosen at `choice`, is open this visit. */
export function whyOpen(
  session: DramaSession,
  choice: string,
  option: string
): boolean {
  const opened = openedAt(session, choice)
  return opened !== undefined && Object.hasOwn(opened, option)
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
      resumed: point !== undefined && opened.state.route.length > 0,
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
    const { choice, option } = event
    return whyOpen(session, choice, option)
      ? { session, effects: [] }
      : {
          session: {
            ...session,
            whys: {
              ...session.whys,
              [choice]: { ...openedAt(session, choice), [option]: true },
            },
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
        session: readSilently(lesson, {
          ...session,
          drama: moved.state,
          resumed: false,
        }),
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

/** A candidate a route took: one the route names, so it has an id. */
type ChosenCandidate = ProbeOption & { id: string }

/** The option chosen to reach a scene, as the POV says it, or bites back. */
type ChosenLine = {
  /** The choice it answered. */
  choice: string
  candidate: ChosenCandidate
  /**
   * An odd-one-out's pick is the line the POV must not say: it is drawn as
   * swallowed, never as speech.
   */
  swallowed: boolean
}

/** A choice the route made, told as what happened (the author's notes). */
type Note = ChosenLine & {
  /** Where the choice was made: the scene that asked it. */
  place: string
  /** The asking scene's last line: what the choice answered. */
  trigger: Beat | undefined
  /** The answered scene's first beat: what the choice led to. */
  reaction: Beat | undefined
}

export type Panel =
  /**
   * A scene the route passed: its beats, and the line that left it, kept
   * above the current scene and read-only. It names its scene's feeling but
   * wears none, as the review does (MK6).
   */
  | {
      kind: "past"
      id: string
      scene: Scene<Probe>
      /** The line that led into this scene; none at the root. */
      chosen: ChosenLine | undefined
    }
  /** Where a resumed drama picks up. */
  | { kind: "resume"; id: string }
  | { kind: "chosen"; id: string; chosen: ChosenLine; speaker: string }
  | {
      kind: "cover"
      id: string
      scene: Scene<Probe>
      feeling: FeelingKey
    }
  /**
   * `feeling` is `null` on the beat that answers a chosen line; `final`
   * marks a leaf's last beat at its ending.
   */
  | {
      kind: "line"
      id: string
      line: Line
      feeling: FeelingKey | null
      final: boolean
    }
  | {
      kind: "narration"
      id: string
      narration: Narration
      feeling: FeelingKey | null
      final: boolean
    }
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

/** Matches the candidate whose id is `id`; none when there is no id. */
const isNamed =
  (id: string | undefined) =>
  (option: ProbeOption): option is ChosenCandidate =>
    id !== undefined && option.id === id

/** A choice the route crossed: the scene that asked it, and its answer. */
type Crossed = {
  depth: number
  asking: Scene<Probe>
  chosen: ChosenLine
  /** The scene the answer led to. */
  answered: Scene<Probe>
}

/** Every choice `route` crossed, root first. */
function crossedOf(
  lesson: DramaLesson,
  route: ReadonlyArray<string>
): Array<Crossed> {
  return route.flatMap((option, depth): Array<Crossed> => {
    const asking = sceneAt(lesson.root, route.slice(0, depth))
    const choice = asking?.choice
    const candidate = choice?.check.options.find(isNamed(option))
    const answered = choice?.options.find(({ id }) => id === option)?.child
    if (!asking || !choice || !candidate || !answered) return []
    return [
      {
        depth,
        asking,
        answered,
        chosen: {
          choice: choice.id,
          candidate,
          swallowed: bitesBack(choice.check),
        },
      },
    ]
  })
}

/** A scene's last line, else its last beat: what its choice answers. */
const lastLineOf = (scene: Scene<Probe>): Beat | undefined =>
  scene.beats.filter(isLine).at(-1) ?? scene.beats.at(-1)

/** The beats shown so far in `scene`: up to the current one, or all. */
function shownBeats(scene: Scene<Probe>, session: DramaSession): Array<Beat> {
  const { at } = session.drama
  if (at.kind !== "beat") return scene.beats
  const index = scene.beats.findIndex((beat) => beat.id === at.id)
  return scene.beats.slice(0, index + 1)
}

/**
 * Whether the current scene's feeling is on screen. A child scene's shows,
 * on its cover or a one-beat leaf's ending, once its first beat, the answer
 * to the chosen line, has been read: the Korean answers before the feeling
 * does. The runtime holds the scene's sting to it.
 */
export function coverShown(
  lesson: DramaLesson,
  session: DramaSession
): boolean {
  const { route, at } = session.drama
  if (route.length === 0 || at.kind !== "beat") return true
  return sceneOf(lesson, session).beats[0]?.id !== at.id
}

/**
 * The route's panels, top to bottom: the scenes it passed, read-only, then
 * the current scene (MK6).
 */
export function panelsOf(
  lesson: DramaLesson,
  session: DramaSession
): Array<Panel> {
  const { route, at } = session.drama
  const scene = sceneOf(lesson, session)
  // The audit rejects a tree whose scene names a feeling the renderer does
  // not have (MK4), so this never falls back in a lesson that plays.
  const feeling: FeelingKey = isFeelingKey(scene.feeling)
    ? scene.feeling
    : "tension"
  const crossed = crossedOf(lesson, route)
  const panels: Array<Panel> = crossed.map(({ asking }, depth) => ({
    kind: "past",
    id: `${asking.id}:past`,
    scene: asking,
    chosen: crossed[depth - 1]?.chosen,
  }))
  if (session.resumed && route.length > 0 && at.kind !== "end") {
    panels.push({ kind: "resume", id: "resume" })
  }
  const last = scene.beats.at(-1)
  const beatPanel = (beat: Beat, worn: FeelingKey | null): Panel => {
    const final = at.kind === "end" && beat === last
    return isLine(beat)
      ? { kind: "line", id: beat.id, line: beat, feeling: worn, final }
      : {
          kind: "narration",
          id: beat.id,
          narration: beat,
          feeling: worn,
          final,
        }
  }
  const cover: Panel = {
    kind: "cover",
    id: `${scene.id}:cover`,
    scene,
    feeling,
  }
  const [first, ...rest] = shownBeats(scene, session)
  const chosen = crossed.at(-1)?.chosen
  if (route.length > 0) {
    if (chosen) {
      panels.push({
        kind: "chosen",
        id: `${chosen.choice}:${chosen.candidate.id}`,
        chosen,
        speaker: lesson.pov,
      })
    }
    if (first) panels.push(beatPanel(first, null))
    // A leaf whose one beat answered the choice stops on that beat: its
    // ending panel wears the feeling, with no cover between them.
    const stopped = at.kind === "end" && scene.beats.length === 1
    if (coverShown(lesson, session) && !stopped) panels.push(cover)
    for (const beat of rest) panels.push(beatPanel(beat, feeling))
  } else {
    panels.push(cover)
    for (const beat of [first, ...rest]) {
      if (beat) panels.push(beatPanel(beat, feeling))
    }
  }
  if (at.kind === "choice") {
    panels.push({ kind: "choice", id: `${scene.id}:choice`, scene })
  } else if (at.kind === "end") {
    panels.push({ kind: "ending", id: `${scene.id}:end`, scene, feeling })
    const notes = crossed.map(
      ({ asking, chosen: line, answered }): Note => ({
        ...line,
        place: asking.place,
        trigger: lastLineOf(asking),
        reaction: answered.beats[0],
      })
    )
    if (notes.length > 0) {
      panels.push({ kind: "notes", id: `${scene.id}:notes`, notes })
    }
  }
  return panels
}

/**
 * The choices the route crossed, as the places a replay may pick up from:
 * `rewind` to the one at `depth`.
 */
export function crossroadsOf(
  lesson: DramaLesson,
  session: DramaSession
): Array<{ depth: number; place: string; prompt: string }> {
  return crossedOf(lesson, session.drama.route).map(({ depth, asking }) => ({
    depth,
    place: asking.place,
    prompt: asking.choice?.prompt ?? "",
  }))
}

/** Whether `back` would move: false at a scene's first beat. */
export function canGoBack(lesson: DramaLesson, session: DramaSession): boolean {
  const { at } = session.drama
  if (at.kind !== "beat") return sceneOf(lesson, session).beats.length > 0
  return sceneOf(lesson, session).beats[0]?.id !== at.id
}
