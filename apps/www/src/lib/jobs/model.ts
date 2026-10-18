/**
 * The Jobs wing on the phone, as a value: the digests opened, and an
 * append-only log of everything done with them. `step` is the whole policy;
 * `./runtime` reads files, records voice notes, shares, and decides which
 * late result is stale. React only forwards events (CLAUDE.md, "React is
 * not the coordinator").
 *
 * The log is the record ("Never lose the record", CLAUDE.md): `step` only
 * appends to it, and a later event says what changed (a pick passed, then
 * taken, is taken). Nothing here removes an event. Digests are copies of
 * files kept in Drive's `some-ui jobs/Brief`, so the phone holds only the
 * newest `DIGESTS_KEPT` of them.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  Digest,
  FRICTION,
  OUTCOMES,
  PASS_REASONS,
  Pick,
} from "@some-ui/job-desk"

export type PassReason = (typeof PASS_REASONS)[number]
export type FrictionChip = (typeof FRICTION)[number]
export type Outcome = (typeof OUTCOMES)[number]
export type DebriefResult = "submitted" | "gave-up" | "closed"
export type ShareKind = "decisions" | "scouts"

/** The digests the phone keeps a copy of; Drive keeps every one. */
export const DIGESTS_KEPT = 30

/** A voice note's audio is on the shelf under `id`. */
export type VoiceNote = {
  id: string
  mimeType: string
  durationMs: number
  /** Whose note it is, until an event names it. */
  owner: string
}

export type Scout = {
  id: string
  url: string
  title: string
  why: string
  postingText: string | null
} & (
  | { track: "software"; family: null }
  | { track: "adjacent"; family: "data" | "qa" | "solutions" }
)

type PickRef = { day: string; pickId: string; fingerprint: string }

/** One line of the record. `id` and `at` come from the runtime. */
export type JobEvent = { id: string; at: string } & (
  | ({ type: "taken" } & PickRef)
  | ({
      type: "passed"
      reasons: ReadonlyArray<PassReason>
      note: string
      voice: ReadonlyArray<string>
    } & PickRef)
  | ({ type: "resume-ready" } & PickRef)
  | ({ type: "apply-opened" } & PickRef)
  | ({
      type: "debrief"
      minutes: number
      friction: number
      chips: ReadonlyArray<FrictionChip>
      what: string
      voice: ReadonlyArray<string>
      result: DebriefResult
    } & PickRef)
  | {
      type: "outcome"
      fingerprint: string
      event: Outcome
      on: string
      note: string
    }
  | { type: "disagree"; day: string; fingerprint: string; note: string }
  | { type: "scout"; scout: Scout; voice: ReadonlyArray<string> }
  | {
      type: "shared"
      kind: ShareKind
      /** The local day it was shared on. */
      day: string
      /** The file it went out as. */
      file: string
      /** The log's length when it was made: it covers every event before. */
      through: number
      voice: ReadonlyArray<string>
    }
  /** The person said a share's files arrived, so its audio can leave. */
  | { type: "arrived"; shareId: string }
)

export type JobsState = {
  /** By day, newest last. */
  digests: ReadonlyArray<Digest>
  /** The day Today shows, the digest opened last. */
  current: string | null
  log: ReadonlyArray<JobEvent>
  /** Voice notes whose audio is on the phone, or once was. */
  voice: ReadonlyArray<VoiceNote>
}

export const EMPTY: JobsState = {
  digests: [],
  current: null,
  log: [],
  voice: [],
}

type Stamp = { id: string; at: string }

/** An event as a screen asks for it: the runtime stamps `id` and `at`. */
export type Draft<T = JobEvent> = T extends unknown
  ? Omit<T, "id" | "at">
  : never

export type JobsAction =
  | { type: "opened"; digest: Digest }
  | { type: "voice-kept"; note: VoiceNote }
  | { type: "voice-dropped"; ids: ReadonlyArray<string> }
  | { type: "record"; event: Draft; stamp: Stamp }

const DECIDED = new Set(["taken", "passed"])

function pickEvents(
  log: ReadonlyArray<JobEvent>,
  day: string,
  pickId: string
): ReadonlyArray<JobEvent & PickRef> {
  return log.filter(
    (e): e is JobEvent & PickRef =>
      "pickId" in e && e.day === day && e.pickId === pickId
  )
}

/** Voice ids the log names: no longer a draft's to drop. */
function named(log: ReadonlyArray<JobEvent>): Set<string> {
  const ids = new Set<string>()
  for (const e of log) if ("voice" in e) for (const id of e.voice) ids.add(id)
  return ids
}

/**
 * Whether `event` can be added to `state`: a pick event names a pick of an
 * opened digest, and a step after the decision follows a "taken".
 */
function fits(state: JobsState, event: Draft): boolean {
  if (!("pickId" in event)) return true
  const digest = state.digests.find((d) => d.day === event.day)
  const pick = digest?.picks.find((p) => p.id === event.pickId)
  if (pick?.fingerprint !== event.fingerprint) return false
  if (DECIDED.has(event.type)) return true
  return decisionOf(state, event.day, event.pickId) === "taken"
}

export function step(state: JobsState, action: JobsAction): JobsState {
  switch (action.type) {
    case "opened": {
      const { digest } = action
      const others = state.digests.filter((d) => d.day !== digest.day)
      const digests = [...others, digest]
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-DIGESTS_KEPT)
      return { ...state, digests, current: digest.day }
    }
    case "voice-kept": {
      if (state.voice.some((n) => n.id === action.note.id)) return state
      return { ...state, voice: [...state.voice, action.note] }
    }
    case "voice-dropped": {
      // Only a draft's: a note an event names is part of the record.
      const keep = named(state.log)
      const voice = state.voice.filter(
        (n) => keep.has(n.id) || !action.ids.includes(n.id)
      )
      return voice.length === state.voice.length ? state : { ...state, voice }
    }
    case "record": {
      if (!fits(state, action.event)) return state
      const event: JobEvent = { ...action.event, ...action.stamp }
      return { ...state, log: [...state.log, event] }
    }
    default: {
      return assertNever(action)
    }
  }
}

// What the screens read. Each walks the log, which stays small: a few
// events per pick, a handful of picks a day.

export function currentDigest(state: JobsState): Digest | null {
  return state.digests.find((d) => d.day === state.current) ?? null
}

export function digestOf(state: JobsState, day: string): Digest | null {
  return state.digests.find((d) => d.day === day) ?? null
}

/** The latest decision on a pick, or null while there is none. */
export function decisionOf(
  state: JobsState,
  day: string,
  pickId: string
): "taken" | "passed" | null {
  const decided = pickEvents(state.log, day, pickId).filter((e) =>
    DECIDED.has(e.type)
  )
  const last = decided.at(-1)
  return last?.type === "taken" || last?.type === "passed" ? last.type : null
}

/** The five steps: Review, Decide, Résumé, Apply, Debrief. */
export type Progress =
  | { kind: "open"; step: 0 | 1 | 2 | 3 | 4 }
  | { kind: "passed" }
  | { kind: "done"; result: DebriefResult }

export function progressOf(
  state: JobsState,
  day: string,
  pickId: string
): Progress {
  const events = pickEvents(state.log, day, pickId)
  const decision = decisionOf(state, day, pickId)
  if (decision === "passed") return { kind: "passed" }
  if (decision === null) return { kind: "open", step: 0 }
  const taken = events.map((e) => e.type).lastIndexOf("taken")
  const after = events.slice(taken)
  const debrief = after.filter((e) => e.type === "debrief").at(-1)
  if (debrief?.type === "debrief") {
    return { kind: "done", result: debrief.result }
  }
  if (after.some((e) => e.type === "apply-opened"))
    return { kind: "open", step: 4 }
  if (after.some((e) => e.type === "resume-ready"))
    return { kind: "open", step: 3 }
  return { kind: "open", step: 2 }
}

/** When the posting was last opened for this pick, to time the debrief. */
export function applyOpenedAt(
  state: JobsState,
  day: string,
  pickId: string
): string | null {
  const opened = pickEvents(state.log, day, pickId)
    .filter((e) => e.type === "apply-opened")
    .at(-1)
  return opened?.at ?? null
}

/** The voice notes `owner` has that no event names yet: a form's draft. */
export function draftVoice(
  state: JobsState,
  owner: string
): ReadonlyArray<VoiceNote> {
  const keep = named(state.log)
  return state.voice.filter((n) => n.owner === owner && !keep.has(n.id))
}

/** The owner a pick's pass or debrief records its voice notes under. */
export function pickOwner(
  day: string,
  pickId: string,
  form: "pass" | "debrief"
): string {
  return `${day}/${pickId}/${form}`
}

export const SCOUT_OWNER = "scout"

export type Application = {
  day: string
  pick: Pick
  progress: Progress
  outcomes: ReadonlyArray<{ event: Outcome; on: string }>
}

/** Every pick taken, newest first, with what has happened since. */
export function applicationsOf(state: JobsState): ReadonlyArray<Application> {
  const seen = new Set<string>()
  const found: Array<Application> = []
  for (const e of [...state.log].reverse()) {
    if (e.type !== "taken") continue
    const key = `${e.day}/${e.pickId}`
    if (seen.has(key)) continue
    seen.add(key)
    const pick = digestOf(state, e.day)?.picks.find((p) => p.id === e.pickId)
    const progress = progressOf(state, e.day, e.pickId)
    if (!pick || progress.kind === "passed") continue
    const outcomes = state.log.flatMap((o) =>
      o.type === "outcome" && o.fingerprint === e.fingerprint
        ? [{ event: o.event, on: o.on }]
        : []
    )
    found.push({ day: e.day, pick, progress, outcomes })
  }
  return found
}

export function scoutsOf(state: JobsState): ReadonlyArray<Scout> {
  return state.log.flatMap((e) => (e.type === "scout" ? [e.scout] : []))
}

/** Fingerprints of set-aside postings I said I'd have picked. */
export function disagreed(state: JobsState): ReadonlySet<string> {
  return new Set(
    state.log.flatMap((e) => (e.type === "disagree" ? [e.fingerprint] : []))
  )
}

export function lastShare(
  state: JobsState,
  kind: ShareKind
): (JobEvent & { type: "shared" }) | null {
  const found = state.log
    .filter(
      (e): e is JobEvent & { type: "shared" } =>
        e.type === "shared" && e.kind === kind
    )
    .at(-1)
  return found ?? null
}

/** Whether the files of share `shareId` were said to have arrived. */
export function hasArrived(state: JobsState, shareId: string): boolean {
  return state.log.some((e) => e.type === "arrived" && e.shareId === shareId)
}
