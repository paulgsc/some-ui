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
 * files kept in Drive's `some-ui jobs/Brief`, opened from a file or taken in
 * from home (`fetched`): the
 * phone keeps every digest the log names, that has a pick still open (it
 * holds a queue slot) or that Today shows, and of the rest only the newest
 * `DIGESTS_KEPT`. A pick left untouched for `LAPSE_DAYS` days lapses
 * (`standingOf`): it no longer holds a slot, and nothing is recorded, since
 * the lapse follows from the digest's day alone.
 */
import { addDays, assertNever } from "@some-ui/core-utils"
import type {
  AdjacentFamily,
  DEBRIEF_RESULTS,
  DECISIONS,
  Digest,
  FRICTION,
  JobsRun,
  Kit,
  OUTCOMES,
  PASS_REASONS,
  Pick,
} from "@some-ui/job-desk"
import {
  DebriefMinutesSchema,
  freeSlots,
  FrictionSchema,
  hasLapsed,
  lapsesOn,
  MAX_NOTE,
  MAX_POSTING_TEXT,
  MAX_SCOUT_TITLE,
  MAX_URL,
  pacificDay,
  ScoutLocationSchema,
  ScoutPostedOnSchema,
  TRACKS,
} from "@some-ui/job-desk"

import type { NoticeAction, NoticeState } from "./notice"
import { NO_NOTICE, stepNotice } from "./notice"

export type PassReason = (typeof PASS_REASONS)[number]
export type FrictionChip = (typeof FRICTION)[number]
export type Outcome = (typeof OUTCOMES)[number]
export type DebriefResult = (typeof DEBRIEF_RESULTS)[number]
export type ShareKind = "decisions" | "scouts"

/** The digests no event names that the phone keeps a copy of. */
export const DIGESTS_KEPT = 30

/**
 * The most digests one exchange with home takes in. Home answers with at
 * most this many (paulgsc/server's `DIGESTS_PER_ANSWER`), and the phone takes
 * no more than this from any answer.
 */
export const DIGESTS_PER_RUN = 7

/**
 * The morning runs' records the phone keeps, newest first: a week, as many as
 * home answers with (paulgsc/server's `RUNS_PER_ANSWER`). Each is a copy of
 * one home keeps for good, so the ones let go here are lost to nothing.
 */
export const RUNS_KEPT = 7

/** A voice note's audio is on the shelf under `id`. */
export type VoiceNote = {
  id: string
  mimeType: string
  durationMs: number
  /** Whose note it is, until an event names it. */
  owner: string
}

/**
 * A scout as the form makes it; the runtime gives it its `id`. `location`
 * and `postedOn` are left out when I give none, so a scout without them is
 * the event it always was.
 */
export type ScoutDraft = {
  url: string
  title: string
  why: string
  postingText: string | null
  /** Where the posting is, as its page says. */
  location?: string
  /** The day its page says it was posted, or null when the page shows none. */
  postedOn?: string | null
} & (
  | { track: "software"; family: null }
  | { track: "adjacent"; family: AdjacentFamily }
)

type Scout = { id: string } & ScoutDraft

/** Names one pick: ids are unique only within the digest of `day`. */
export type PickRef = { day: string; pickId: string; fingerprint: string }

/** One line of the record. `id` and `at` come from the runtime. */
export type JobEvent = { id: string; at: string } & (
  | ({ type: "taken" } & PickRef)
  /** `archived` in `@some-ui/job-desk`'s decisions. */
  | ({ type: "archived" } & PickRef)
  | ({
      type: "passed"
      reasons: ReadonlyArray<PassReason>
      note: string
      voice: ReadonlyArray<string>
    } & PickRef)
  /** Why I fit a pick I took: the next run redrafts its application from it. */
  | ({
      type: "fit-note"
      note: string
      voice: ReadonlyArray<string>
    } & PickRef)
  | ({ type: "resume-ready" } & PickRef)
  | ({ type: "apply-opened" } & PickRef)
  /** A posting read through, with no verdict: it never moves the pick. */
  | ({ type: "read" } & PickRef)
  | ({
      type: "debrief"
      /** Null when left unsaid. */
      minutes: number | null
      friction: number | null
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
  /** An outcome taken back, by its event's id; it stays in the log. */
  | { type: "outcome-withdrawn"; outcomeId: string }
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
  /** The person said a share's files arrived: they count as sent. */
  | { type: "arrived"; shareId: string }
)

/** One event home would not hold, and why it said so. */
export type HomeRefusal = { id: string; why: string }

/**
 * The record kept on the paired home (`./home`): a copy, since the phone keeps
 * its whole log, and the way back for a phone that lost it.
 */
type JobsHome = {
  /** The events home answered it holds, by id. */
  held: ReadonlyArray<string>
  /** The events home refused: kept here, and not sent again. */
  refused: ReadonlyArray<HomeRefusal>
  /**
   * The decisions and scouts files home refused, by name: left to the share
   * sheet, and never filed with home again.
   */
  refusedFiles: ReadonlyArray<string>
  /**
   * When home last answered which digests it holds, even with none new:
   * whether this phone has heard from home since the morning run
   * (`./morning`).
   */
  lookedAt: string | null
  /**
   * The morning runs' records as home last told them, newest first, at most
   * `RUNS_KEPT`: what each run did, and what it couldn't (`./morning`). Null
   * until a home that keeps them has answered.
   */
  runs: ReadonlyArray<JobsRun> | null
  /** Whether home tells this phone when a morning run is in (`./notice`). */
  notice: NoticeState
}

export type JobsState = {
  /** By day, newest last. */
  digests: ReadonlyArray<Digest>
  /** The day Today shows, the digest opened last. */
  current: string | null
  /** When each kept digest first came to this phone, opened or taken in from home, by its day. */
  firstOpened: Readonly<Record<string, string>>
  log: ReadonlyArray<JobEvent>
  /** Voice notes whose audio is on the phone, or once was. */
  voice: ReadonlyArray<VoiceNote>
  home: JobsHome
  /**
   * Where in the log each share's file began, by the share's id: what it
   * carried runs from here to its `through` (`./journey`). The phone's own
   * note, never sent; a share made before it was kept has none.
   */
  carried: Readonly<Record<string, number>>
}

export const EMPTY: JobsState = {
  digests: [],
  current: null,
  firstOpened: {},
  log: [],
  voice: [],
  home: {
    held: [],
    refused: [],
    refusedFiles: [],
    lookedAt: null,
    runs: null,
    notice: NO_NOTICE,
  },
  carried: {},
}

type Stamp = { id: string; at: string }

/** An event as a screen asks for it: the runtime stamps `id` and `at`. */
export type Draft<T = JobEvent> = T extends unknown
  ? Omit<T, "id" | "at">
  : never

export type JobsAction =
  | { type: "opened"; digest: Digest; at: string }
  /**
   * Digests home holds, and its morning runs' records (none from a home that
   * doesn't keep them).
   */
  | {
      type: "fetched"
      digests: ReadonlyArray<Digest>
      runs?: ReadonlyArray<JobsRun>
      at: string
    }
  | { type: "voice-kept"; note: VoiceNote }
  | { type: "voice-dropped"; ids: ReadonlyArray<string> }
  /**
   * Home holds these notes, so their audio leaves the phone and their
   * entries go with it; the log still names them.
   */
  | { type: "voice-held"; ids: ReadonlyArray<string> }
  /** `since`, for a share: where its file began (`carried`). */
  | { type: "record"; event: Draft; stamp: Stamp; since?: number }
  /** Several events kept together, or none if any doesn't fit. */
  | {
      type: "record-all"
      events: ReadonlyArray<{ event: Draft; stamp: Stamp; since?: number }>
    }
  /** What one exchange with home learned (`./home`). */
  | {
      type: "home-answered"
      held: ReadonlyArray<string>
      refused: ReadonlyArray<HomeRefusal>
    }
  /** Home's copy, taken in by a phone whose own log is empty. */
  | { type: "restored"; events: ReadonlyArray<JobEvent> }
  /** Home refused the file of this name (`./home`). */
  | { type: "file-refused"; name: string }
  | NoticeAction

const DECIDED = new Set(["taken", "passed", "archived"])

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

/**
 * An event that is a step on a pick: every one naming a pick but a reading,
 * which moves nothing, goes out in no file and keeps no digest.
 */
export function isPickStep(e: JobEvent): e is JobEvent & PickRef {
  return "pickId" in e && e.type !== "read"
}

/** Voice ids the log names: no longer a draft's to drop. */
function named(log: ReadonlyArray<JobEvent>): Set<string> {
  const ids = new Set<string>()
  for (const e of log) if ("voice" in e) for (const id of e.voice) ids.add(id)
  return ids
}

/**
 * Whether a fit note says something, in words or aloud. Home trims U+0085
 * too, and refuses a note left with nothing.
 */
export function fitNoteSays(
  note: string,
  voice: ReadonlyArray<unknown>
): boolean {
  return note.replace(/\u0085/g, "").trim() !== "" || voice.length > 0
}

/** A pick's event that names voice notes. */
export function carriesPickVoice(
  e: JobEvent
): e is JobEvent & { type: "passed" | "fit-note" | "debrief" } {
  return e.type === "passed" || e.type === "fit-note" || e.type === "debrief"
}

/** Whether `event`'s texts are within what home takes. */
function withinLimits(event: Draft): boolean {
  switch (event.type) {
    case "passed":
    case "outcome":
    case "disagree": {
      return event.note.length <= MAX_NOTE
    }
    case "debrief": {
      return event.what.length <= MAX_NOTE
    }
    case "fit-note": {
      return (
        event.note.length <= MAX_NOTE && fitNoteSays(event.note, event.voice)
      )
    }
    case "scout": {
      const { scout } = event
      return (
        scout.url.startsWith("https://") &&
        scout.url.length <= MAX_URL &&
        scout.title.length <= MAX_SCOUT_TITLE &&
        scout.why.length <= MAX_NOTE &&
        (scout.postingText?.length ?? 0) <= MAX_POSTING_TEXT &&
        (scout.location === undefined ||
          ScoutLocationSchema.safeParse(scout.location).success) &&
        (scout.postedOn === undefined ||
          ScoutPostedOnSchema.safeParse(scout.postedOn).success)
      )
    }
    case "taken":
    case "archived":
    case "resume-ready":
    case "apply-opened":
    case "read":
    case "outcome-withdrawn":
    case "shared":
    case "arrived": {
      return true
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * Whether `event` can be added to `state`: a pick event names a pick of an
 * opened digest, and a step after the decision follows a "taken".
 */
function fits(state: JobsState, event: Draft): boolean {
  if (!withinLimits(event)) return false
  if (event.type === "scout") return true
  if (event.type === "outcome-withdrawn")
    return standingOutcomes(state.log).some((o) => o.id === event.outcomeId)
  if (
    event.type === "debrief" &&
    !(
      DebriefMinutesSchema.nullable().safeParse(event.minutes).success &&
      FrictionSchema.nullable().safeParse(event.friction).success
    )
  ) {
    return false
  }
  if (!("pickId" in event)) return true
  const digest = state.digests.find((d) => d.day === event.day)
  const pick = digest?.picks.find((p) => p.id === event.pickId)
  if (pick?.fingerprint !== event.fingerprint) return false
  if (DECIDED.has(event.type) || event.type === "read") return true
  // A debriefed pick is out of the queue, so no run would redraft it.
  const taken = decisionOf(state, event.day, event.pickId) === "taken"
  if (event.type === "fit-note")
    return taken && progressOf(state, event.day, event.pickId).kind === "open"
  return taken
}

/**
 * `state`'s digests with `incoming` among them (a day `incoming` repeats is
 * replaced), the ones kept once `DIGESTS_KEPT` has let go of the rest, and
 * when each came to this phone: a day already held keeps its first time.
 * The digest Today shows (`shown`) is kept too: an old file opened by hand,
 * whose picks all lapsed, holds no place but is the one being read.
 */
function takeDigests(
  state: JobsState,
  incoming: ReadonlyArray<Digest>,
  at: string,
  shown: string | null
): { digests: JobsState["digests"]; firstOpened: JobsState["firstOpened"] } {
  const days = new Set(incoming.map((d) => d.day))
  const others = state.digests.filter((d) => !days.has(d.day))
  const all = [...others, ...incoming].sort((a, b) =>
    a.day.localeCompare(b.day)
  )
  const recent = new Set(all.slice(-DIGESTS_KEPT).map((d) => d.day))
  const referenced = new Set(
    state.log.flatMap((e) => (isPickStep(e) ? [e.day] : []))
  )
  // Over `all`, so the digests being taken count too.
  const open = openOf({ ...state, digests: all }, pacificDay(new Date(at)))
  const holding = new Set(open.map((o) => o.day))
  const openKeys = new Set(open.map((o) => `${o.day}/${o.pick.id}`))
  // A redraft of an open pick stands in for its drafts (`kitOf`).
  const redrafting = (d: Digest): boolean =>
    d.redrafts.some((r) => openKeys.has(`${r.day}/${r.pickId}`))
  const digests = all.filter(
    (d) =>
      d.day === shown ||
      recent.has(d.day) ||
      referenced.has(d.day) ||
      holding.has(d.day) ||
      redrafting(d)
  )
  const firstOpened = Object.fromEntries(
    Object.entries({
      ...Object.fromEntries([...days].map((day) => [day, at])),
      ...state.firstOpened,
    }).filter(([day]) => digests.some((d) => d.day === day))
  )
  return { digests, firstOpened }
}

function newestRuns(runs: ReadonlyArray<JobsRun>): ReadonlyArray<JobsRun> {
  return [...runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, RUNS_KEPT)
}

export function step(state: JobsState, action: JobsAction): JobsState {
  switch (action.type) {
    case "opened": {
      const { digests, firstOpened } = takeDigests(
        state,
        [action.digest],
        action.at,
        action.digest.day
      )
      return { ...state, digests, current: action.digest.day, firstOpened }
    }
    case "fetched": {
      // A day the phone holds is never replaced: it may be the one a person
      // is deciding on, and the file they opened is the one they read.
      const held = new Set(state.digests.map((d) => d.day))
      const fresh = new Map<string, Digest>()
      for (const d of action.digests) {
        if (!held.has(d.day) && !fresh.has(d.day)) fresh.set(d.day, d)
      }
      const { digests, firstOpened } = takeDigests(
        state,
        [...fresh.values()],
        action.at,
        state.current
      )
      const home = {
        ...state.home,
        lookedAt: action.at,
        // Home answers its newest, so they replace what the phone held.
        ...(action.runs === undefined ? {} : { runs: newestRuns(action.runs) }),
      }
      // Taken, and not let go at once by `DIGESTS_KEPT`.
      const kept = digests.filter((d) => fresh.has(d.day))
      const newest = kept.at(-1)
      if (newest === undefined) return { ...state, home }
      const current =
        state.current === null || newest.day > state.current
          ? newest.day
          : state.current
      return { ...state, digests, current, firstOpened, home }
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
    case "voice-held": {
      const voice = state.voice.filter((n) => !action.ids.includes(n.id))
      return voice.length === state.voice.length ? state : { ...state, voice }
    }
    case "record": {
      if (!fits(state, action.event)) return state
      const event: JobEvent = { ...action.event, ...action.stamp }
      const log = [...state.log, event]
      if (event.type !== "shared" || action.since === undefined) {
        return { ...state, log }
      }
      const carried = { ...state.carried, [event.id]: action.since }
      return { ...state, log, carried }
    }
    case "record-all": {
      let next = state
      for (const { event, stamp, since } of action.events) {
        const after = step(next, {
          type: "record",
          event,
          stamp,
          ...(since === undefined ? {} : { since }),
        })
        if (after === next) return state
        next = after
      }
      return next
    }
    case "home-answered": {
      const inLog = new Set(state.log.map((e) => e.id))
      const known = new Set([
        ...state.home.held,
        ...state.home.refused.map((r) => r.id),
      ])
      const fresh = (id: string): boolean => {
        if (!inLog.has(id) || known.has(id)) return false
        known.add(id)
        return true
      }
      const held = action.held.filter(fresh)
      const refused = action.refused.filter((r) => fresh(r.id))
      if (held.length + refused.length === 0) return state
      return {
        ...state,
        home: {
          ...state.home,
          held: [...state.home.held, ...held],
          refused: [...state.home.refused, ...refused],
        },
      }
    }
    case "file-refused": {
      if (state.home.refusedFiles.includes(action.name)) return state
      return {
        ...state,
        home: {
          ...state.home,
          refusedFiles: [...state.home.refusedFiles, action.name],
        },
      }
    }
    case "notice-wanted":
    case "notice-token":
    case "notice-filed": {
      const notice = stepNotice(state.home.notice, action)
      if (notice === state.home.notice) return state
      return { ...state, home: { ...state.home, notice } }
    }
    case "restored": {
      if (state.log.length > 0 || action.events.length === 0) return state
      return {
        ...state,
        log: [...action.events],
        home: { ...state.home, held: action.events.map((e) => e.id) },
      }
    }
    default: {
      return assertNever(action)
    }
  }
}

// What the screens read, each a walk of the log.

export function currentDigest(state: JobsState): Digest | null {
  return state.digests.find((d) => d.day === state.current) ?? null
}

export function digestOf(state: JobsState, day: string): Digest | null {
  return state.digests.find((d) => d.day === day) ?? null
}

/** The day of the newest digest the phone holds, or null while it holds none. */
export function newestDay(state: JobsState): string | null {
  return state.digests.at(-1)?.day ?? null
}

/** Whether every place was held when `digest`'s run began, so it could pick none. */
export function placesFull(digest: Digest): boolean {
  if (digest.queue === null) return false
  const room = freeSlots(digest.queue.open)
  return TRACKS.every((track) => room[track] === 0)
}

export type Decision = Exclude<(typeof DECISIONS)[number], "untouched">

/** The latest decision on a pick, or null while there is none. */
export function decisionOf(
  state: JobsState,
  day: string,
  pickId: string
): Decision | null {
  const decided = pickEvents(state.log, day, pickId).filter((e) =>
    DECIDED.has(e.type)
  )
  const last = decided.at(-1)
  return last?.type === "taken" ||
    last?.type === "passed" ||
    last?.type === "archived"
    ? last.type
    : null
}

/**
 * The picks of every kept digest still open on the phone on Pacific day
 * `today`: no decision for fewer than `LAPSE_DAYS` days, or taken with no
 * debrief. The morning run counts the same rule over what was shared
 * (`queueOf`), so until a share arrives it may count more, or lapse a pick
 * the phone has decided.
 */
export function openOf(
  state: JobsState,
  today: string
): ReadonlyArray<{ day: string; pick: Pick }> {
  return picksStanding(state, today, "open")
}

/** The picks of every kept digest whose standing on `today` is `kind`. */
export function picksStanding(
  state: JobsState,
  today: string,
  kind: Standing["kind"]
): ReadonlyArray<{ day: string; pick: Pick }> {
  return state.digests.flatMap((d) =>
    d.picks
      .filter((p) => standingOf(state, d.day, p.id, today).kind === kind)
      .map((pick) => ({ day: d.day, pick }))
  )
}

/** The five steps: Review, Decide, Résumé, Apply, Debrief. */
export type Progress =
  | { kind: "open"; step: 0 | 1 | 2 | 3 | 4 }
  | { kind: "passed" }
  | { kind: "archived" }
  | { kind: "done"; result: DebriefResult }

/**
 * Where a pick stands on Pacific day `today`: its progress, or lapsed (and
 * since when) once it waited `LAPSE_DAYS` days with no decision. A decision
 * made after that replaces the lapse.
 */
export type Standing = Progress | { kind: "lapsed"; on: string }

export function standingOf(
  state: JobsState,
  day: string,
  pickId: string,
  today: string
): Standing {
  const progress = progressOf(state, day, pickId)
  const untouched = progress.kind === "open" && progress.step === 0
  return untouched && hasLapsed(day, today)
    ? { kind: "lapsed", on: lapsesOn(day) }
    : progress
}

export function progressOf(
  state: JobsState,
  day: string,
  pickId: string
): Progress {
  const events = pickEvents(state.log, day, pickId)
  const decision = decisionOf(state, day, pickId)
  if (decision === "passed") return { kind: "passed" }
  if (decision === "archived") return { kind: "archived" }
  if (decision === null) return { kind: "open", step: 0 }
  const after = sinceTaken(events)
  const debrief = debriefOf(state, day, pickId)
  if (debrief) return { kind: "done", result: debrief.result }
  if (after.some((e) => e.type === "apply-opened"))
    return { kind: "open", step: 4 }
  if (after.some((e) => e.type === "resume-ready"))
    return { kind: "open", step: 3 }
  return { kind: "open", step: 2 }
}

/** A pick's events from its latest "taken" on: the attempt under way. */
function sinceTaken(
  events: ReadonlyArray<JobEvent & PickRef>
): ReadonlyArray<JobEvent & PickRef> {
  const taken = events.map((e) => e.type).lastIndexOf("taken")
  return taken < 0 ? [] : events.slice(taken)
}

/** Whether a pick was read on local day `on`: a read counts once a day. */
export function readOn(
  state: JobsState,
  day: string,
  pickId: string,
  on: string,
  dayOf: (at: Date) => string
): boolean {
  return pickEvents(state.log, day, pickId).some(
    (e) => e.type === "read" && dayOf(new Date(e.at)) === on
  )
}

/** The debrief of a pick's latest attempt, if it has one. */
export function debriefOf(
  state: JobsState,
  day: string,
  pickId: string
): (JobEvent & { type: "debrief" }) | null {
  const debrief = sinceTaken(pickEvents(state.log, day, pickId))
    .filter((e) => e.type === "debrief")
    .at(-1)
  return debrief?.type === "debrief" ? debrief : null
}

/**
 * A pick's kit with the newest redraft of its drafts (ROUTINE.md §2) in
 * place of its own, draft by draft, and the day of the digest that wrote
 * it, or null.
 */
export function kitOf(
  state: JobsState,
  day: string,
  pick: Pick
): { kit: Kit; redraftedOn: string | null } {
  for (const digest of [...state.digests].reverse()) {
    if (digest.day <= day) break
    const redraft = digest.redrafts.find(
      (r) => r.day === day && r.pickId === pick.id
    )
    if (!redraft) continue
    const asked = new Set(pick.kit.questions.map((q) => q.label))
    const questions = [
      ...pick.kit.questions.map((q) => {
        const draft = redraft.questions.find(
          (r) => r.label === q.label && r.draft
        )?.draft
        return draft && draft !== q.draft ? { ...q, draft } : q
      }),
      ...redraft.questions.filter((r) => !asked.has(r.label) && r.draft),
    ]
    const coverLetter = redraft.coverLetter ?? pick.kit.coverLetter
    const changed =
      coverLetter !== pick.kit.coverLetter ||
      questions.some((q, i) => q !== pick.kit.questions[i])
    if (!changed) break
    return {
      kit: { ...pick.kit, coverLetter, questions },
      redraftedOn: digest.day,
    }
  }
  return { kit: pick.kit, redraftedOn: null }
}

/** The fit notes recorded on a pick, oldest first. */
export function fitNotesOf(
  state: JobsState,
  day: string,
  pickId: string
): ReadonlyArray<JobEvent & { type: "fit-note" }> {
  return state.log.flatMap((e) =>
    e.type === "fit-note" && e.day === day && e.pickId === pickId ? [e] : []
  )
}

/** The longest the debrief offers as how long an application took (JB1). */
const TIMED_UP_TO_MINUTES = 120

/** Opens of a posting closer together than this are one sitting (JB1). */
const SITTING_GAP_MINUTES = 30

/**
 * The whole minutes the debrief offers as how long the application took:
 * since the first open of the posting in the latest sitting, so a lost tab
 * reopened still counts from the start. Null when it never opened since the
 * pick was taken, or that sitting began longer ago than
 * `TIMED_UP_TO_MINUTES`, which more likely means I left and came back.
 */
export function timedMinutes(
  state: JobsState,
  day: string,
  pickId: string,
  now: Date
): number | null {
  const opens = sinceTaken(pickEvents(state.log, day, pickId))
    .filter((e) => e.type === "apply-opened")
    .map((e) => Date.parse(e.at))
  const gap = SITTING_GAP_MINUTES * 60_000
  let start = opens.at(-1)
  if (start === undefined) return null
  for (const at of opens.slice(0, -1).reverse()) {
    if (start - at > gap) break
    start = at
  }
  const minutes = Math.max(1, Math.round((now.getTime() - start) / 60_000))
  return minutes <= TIMED_UP_TO_MINUTES ? minutes : null
}

/** The voice notes `owner` has that no event names yet: a form's draft. */
export function draftVoice(
  state: JobsState,
  owner: string
): ReadonlyArray<VoiceNote> {
  const keep = named(state.log)
  return state.voice.filter((n) => n.owner === owner && !keep.has(n.id))
}

/** The owner a pick's pass, fit note or debrief records its voice notes under. */
export function pickOwner(
  day: string,
  pickId: string,
  form: "pass" | "fit" | "debrief"
): string {
  return `${day}/${pickId}/${form}`
}

export const SCOUT_OWNER = "scout"

export type Application = {
  day: string
  pick: Pick
  progress: Progress
  /** The outcomes that stand, oldest first. */
  outcomes: ReadonlyArray<{ id: string; event: Outcome; on: string }>
}

/** The outcomes in `log` that no event withdrew, oldest first. */
function standingOutcomes(
  log: ReadonlyArray<JobEvent>
): ReadonlyArray<JobEvent & { type: "outcome" }> {
  const withdrawn = new Set(
    log.flatMap((e) => (e.type === "outcome-withdrawn" ? [e.outcomeId] : []))
  )
  return log.filter(
    (e): e is JobEvent & { type: "outcome" } =>
      e.type === "outcome" && !withdrawn.has(e.id)
  )
}

/** Every pick taken, newest first, with what has happened since. */
export function applicationsOf(state: JobsState): ReadonlyArray<Application> {
  const seen = new Set<string>()
  const found: Array<Application> = []
  const standing = standingOutcomes(state.log)
  for (const e of [...state.log].reverse()) {
    if (e.type !== "taken") continue
    const key = `${e.day}/${e.pickId}`
    if (seen.has(key)) continue
    seen.add(key)
    const pick = digestOf(state, e.day)?.picks.find((p) => p.id === e.pickId)
    const progress = progressOf(state, e.day, e.pickId)
    if (!pick || progress.kind === "passed" || progress.kind === "archived")
      continue
    const outcomes = standing.flatMap((o) =>
      o.fingerprint === e.fingerprint
        ? [{ id: o.id, event: o.event, on: o.on }]
        : []
    )
    found.push({ day: e.day, pick, progress, outcomes })
  }
  return found
}

/** The steps an application climbs, in order. */
const STAGES = ["viewed", "reply", "screen", "interview", "offer"] as const

/** An outcome after which nothing more is expected of an application. */
const ENDINGS = ["offer", "rejected", "no-reply-30d"] as const

type Ending = (typeof ENDINGS)[number]

/** Days an application waits with no reply before it can be said to have had none. */
const NO_REPLY_DAYS = 30

/**
 * Where an application stands, and what can still be said of it:
 * - `applying`: not debriefed yet, so nothing has come of it;
 * - `unsent`: debriefed as given up or closed, so nothing can come of it;
 * - `waiting`: sent on `since`, its furthest stage so far (null for none),
 *   and the outcomes still ahead of it;
 * - `ended`: sent on `since`, its newest outcome an ending, on `on`. `next`
 *   is what a later outcome could still say (a stage past `reached`, or a
 *   rejection after the silence), offered only when asked, since the log
 *   keeps the ending and the newest outcome is the one that stands.
 */
export type Course =
  | { kind: "applying" }
  | { kind: "unsent"; result: Exclude<DebriefResult, "submitted"> }
  | {
      kind: "waiting"
      since: string
      reached: Outcome | null
      next: ReadonlyArray<Outcome>
    }
  | {
      kind: "ended"
      since: string
      by: Ending
      on: string
      reached: Outcome | null
      next: ReadonlyArray<Outcome>
    }

function isEnding(o: Outcome): o is Ending {
  return ENDINGS.some((e) => e === o)
}

/** An application's course on local day `today`, its debrief day by `dayOf`. */
export function courseOf(
  state: JobsState,
  application: Application,
  today: string,
  dayOf: (at: Date) => string
): Course {
  const { progress } = application
  if (progress.kind !== "done") return { kind: "applying" }
  if (progress.result !== "submitted")
    return { kind: "unsent", result: progress.result }
  const debrief = debriefOf(state, application.day, application.pick.id)
  const since = debrief ? dayOf(new Date(debrief.at)) : application.day
  // Outcomes follow the posting, so one dated before this sending answered
  // an earlier attempt at it.
  const outcomes = application.outcomes.filter((o) => o.on >= since)
  const furthest = Math.max(
    -1,
    ...outcomes.map((o) => STAGES.findIndex((stage) => stage === o.event))
  )
  const reached = furthest < 0 ? null : STAGES[furthest]
  const ahead = STAGES.slice(furthest + 1)
  const newest = outcomes.at(-1)
  if (newest && isEnding(newest.event)) {
    const by = newest.event
    return {
      kind: "ended",
      since,
      by,
      on: newest.on,
      reached,
      next: [
        ...ahead.filter((o) => o !== by),
        ...(by === "rejected" ? [] : (["rejected"] as const)),
      ],
    }
  }
  const unanswered = furthest <= STAGES.indexOf("viewed")
  const silent =
    unanswered && today >= addDays(since, NO_REPLY_DAYS)
      ? (["no-reply-30d"] as const)
      : []
  return {
    kind: "waiting",
    since,
    reached,
    next: [...ahead, "rejected", ...silent],
  }
}

/** Fingerprints of set-aside postings I said I'd have picked. */
export function disagreed(state: JobsState): ReadonlySet<string> {
  return new Set(
    state.log.flatMap((e) => (e.type === "disagree" ? [e.fingerprint] : []))
  )
}

/**
 * The last share of `kind` the person said arrived. A share they did not
 * confirm counts for nothing, so what it carried is offered again.
 */
export function lastDelivered(
  state: JobsState,
  kind: ShareKind
): (JobEvent & { type: "shared" }) | null {
  const found = state.log
    .filter(
      (e): e is JobEvent & { type: "shared" } =>
        e.type === "shared" && e.kind === kind && hasArrived(state, e.id)
    )
    .at(-1)
  return found ?? null
}

/**
 * How much of the log the last share of `kind` that arrived covers: its
 * `through`, but never past its own place. A log home restored (`restored`)
 * lacks the events home refused, so a share in it sits earlier than it did.
 */
export function deliveredThrough(state: JobsState, kind: ShareKind): number {
  const share = lastDelivered(state, kind)
  if (share === null) return 0
  return coveredBy(share, state.log.indexOf(share))
}

/** How much of the log a share at `index` covers: its `through`, never past itself. */
export function coveredBy(share: { through: number }, index: number): number {
  return Math.min(share.through, index)
}

/** How many shares of `kind` went out on `day`, confirmed or not. */
export function sharesOn(
  state: JobsState,
  kind: ShareKind,
  day: string
): number {
  return state.log.filter(
    (e) => e.type === "shared" && e.kind === kind && e.day === day
  ).length
}

/**
 * Whether a decisions share that arrived already reported `day`'s untouched
 * picks: one made after that digest was first opened, on a later day.
 */
export function untouchedReported(state: JobsState, day: string): boolean {
  const opened = state.firstOpened[day] ?? ""
  return state.log.some(
    (e) =>
      e.type === "shared" &&
      e.kind === "decisions" &&
      e.day > day &&
      e.at >= opened &&
      hasArrived(state, e.id)
  )
}

/** The events home does not hold yet and has not refused, in log order. */
export function homeOutbox(state: JobsState): ReadonlyArray<JobEvent> {
  const held = new Set(state.home.held)
  const refused = new Set(state.home.refused.map((r) => r.id))
  return state.log.filter((e) => !held.has(e.id) && !refused.has(e.id))
}

/** Whether the files of share `shareId` were said to have arrived. */
function hasArrived(state: JobsState, shareId: string): boolean {
  return state.log.some((e) => e.type === "arrived" && e.shareId === shareId)
}
