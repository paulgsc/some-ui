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
 * phone keeps every digest the log names or that has a pick still open (it
 * holds a queue slot), and of the rest only the newest `DIGESTS_KEPT`.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  AdjacentFamily,
  DEBRIEF_RESULTS,
  DECISIONS,
  Digest,
  FRICTION,
  Kit,
  OUTCOMES,
  PASS_REASONS,
  Pick,
} from "@some-ui/job-desk"
import {
  DebriefMinutesSchema,
  FrictionSchema,
  MAX_NOTE,
  MAX_POSTING_TEXT,
  MAX_SCOUT_TITLE,
  MAX_URL,
} from "@some-ui/job-desk"

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

/** A voice note's audio is on the shelf under `id`. */
export type VoiceNote = {
  id: string
  mimeType: string
  durationMs: number
  /** Whose note it is, until an event names it. */
  owner: string
}

/** A scout as the form makes it; the runtime gives it its `id`. */
export type ScoutDraft = {
  url: string
  title: string
  why: string
  postingText: string | null
} & (
  | { track: "software"; family: null }
  | { track: "adjacent"; family: AdjacentFamily }
)

export type Scout = { id: string } & ScoutDraft

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

/** One event home would not hold, and why it said so. */
export type HomeRefusal = { id: string; why: string }

/**
 * The record kept on the paired home (`./home`): a copy, since the phone keeps
 * its whole log, and the way back for a phone that lost it.
 */
type JobsHome = {
  /**
   * Read by the Jobs lane's `keptBefore`, to enter that choice once and for
   * the ledger's wording; never set (LA10).
   */
  kept: boolean
  /** The events home answered it holds, by id. */
  held: ReadonlyArray<string>
  /** The events home refused: kept here, and not sent again. */
  refused: ReadonlyArray<HomeRefusal>
  /**
   * The decisions and scouts files home refused, by name: left to the share
   * sheet, and never filed with home again.
   */
  refusedFiles: ReadonlyArray<string>
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
}

export const EMPTY: JobsState = {
  digests: [],
  current: null,
  firstOpened: {},
  log: [],
  voice: [],
  home: { kept: false, held: [], refused: [], refusedFiles: [] },
}

type Stamp = { id: string; at: string }

/** An event as a screen asks for it: the runtime stamps `id` and `at`. */
export type Draft<T = JobEvent> = T extends unknown
  ? Omit<T, "id" | "at">
  : never

export type JobsAction =
  | { type: "opened"; digest: Digest; at: string }
  /** Digests home holds. */
  | { type: "fetched"; digests: ReadonlyArray<Digest>; at: string }
  | { type: "voice-kept"; note: VoiceNote }
  | { type: "voice-dropped"; ids: ReadonlyArray<string> }
  | { type: "record"; event: Draft; stamp: Stamp }
  /** Several events kept together, or none if any doesn't fit. */
  | {
      type: "record-all"
      events: ReadonlyArray<{ event: Draft; stamp: Stamp }>
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
        (scout.postingText?.length ?? 0) <= MAX_POSTING_TEXT
      )
    }
    case "taken":
    case "archived":
    case "resume-ready":
    case "apply-opened":
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
  if (
    event.type === "debrief" &&
    !(
      DebriefMinutesSchema.safeParse(event.minutes).success &&
      FrictionSchema.safeParse(event.friction).success
    )
  ) {
    return false
  }
  if (!("pickId" in event)) return true
  const digest = state.digests.find((d) => d.day === event.day)
  const pick = digest?.picks.find((p) => p.id === event.pickId)
  if (pick?.fingerprint !== event.fingerprint) return false
  if (DECIDED.has(event.type)) return true
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
 */
function takeDigests(
  state: JobsState,
  incoming: ReadonlyArray<Digest>,
  at: string
): { digests: JobsState["digests"]; firstOpened: JobsState["firstOpened"] } {
  const days = new Set(incoming.map((d) => d.day))
  const others = state.digests.filter((d) => !days.has(d.day))
  const all = [...others, ...incoming].sort((a, b) =>
    a.day.localeCompare(b.day)
  )
  const recent = new Set(all.slice(-DIGESTS_KEPT).map((d) => d.day))
  const referenced = new Set(
    state.log.flatMap((e) => ("pickId" in e ? [e.day] : []))
  )
  // Over `all`, so the digests being taken count too.
  const open = openOf({ ...state, digests: all })
  const holding = new Set(open.map((o) => o.day))
  const openKeys = new Set(open.map((o) => `${o.day}/${o.pick.id}`))
  // A redraft of an open pick stands in for its drafts (`kitOf`).
  const redrafting = (d: Digest): boolean =>
    d.redrafts.some((r) => openKeys.has(`${r.day}/${r.pickId}`))
  const digests = all.filter(
    (d) =>
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

export function step(state: JobsState, action: JobsAction): JobsState {
  switch (action.type) {
    case "opened": {
      const { digests, firstOpened } = takeDigests(
        state,
        [action.digest],
        action.at
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
        action.at
      )
      // Taken, and not let go at once by `DIGESTS_KEPT`.
      const kept = digests.filter((d) => fresh.has(d.day))
      const newest = kept.at(-1)
      if (newest === undefined) return state
      const current =
        state.current === null || newest.day > state.current
          ? newest.day
          : state.current
      return { ...state, digests, current, firstOpened }
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
    case "record-all": {
      let next = state
      for (const { event, stamp } of action.events) {
        const after = step(next, { type: "record", event, stamp })
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

/** The Pacific calendar day of `at`, `YYYY-MM-DD`: the morning run's "today". */
export function pacificDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
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

/** `day`'s picks with no decision yet: what archiving its digest lets go. */
export function undecidedOf(
  state: JobsState,
  day: string
): ReadonlyArray<Pick> {
  const picks = digestOf(state, day)?.picks ?? []
  return picks.filter((p) => decisionOf(state, day, p.id) === null)
}

/**
 * The picks of every kept digest still open on the phone: no decision, or
 * taken with no debrief. The morning run counts the same rule over what was
 * shared (`openPicks`), so until a share arrives it may count more.
 */
export function openOf(
  state: JobsState
): ReadonlyArray<{ day: string; pick: Pick }> {
  return state.digests.flatMap((d) =>
    d.picks
      .filter((p) => progressOf(state, d.day, p.id).kind === "open")
      .map((pick) => ({ day: d.day, pick }))
  )
}

/** The five steps: Review, Decide, Résumé, Apply, Debrief. */
export type Progress =
  | { kind: "open"; step: 0 | 1 | 2 | 3 | 4 }
  | { kind: "passed" }
  | { kind: "archived" }
  | { kind: "done"; result: DebriefResult }

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
    if (!pick || progress.kind === "passed" || progress.kind === "archived")
      continue
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
  return Math.min(share.through, state.log.indexOf(share))
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
 * Voice ids whose audio can leave the phone: each one an event names before
 * the last share of its kind that arrived. Such a note either went out in a
 * share that arrived, or belongs to a pass, fit note or debrief a later
 * decision replaced, which no share will send.
 */
export function releasedVoice(state: JobsState): ReadonlySet<string> {
  const through = {
    decisions: deliveredThrough(state, "decisions"),
    scouts: deliveredThrough(state, "scouts"),
  }
  const ids = new Set<string>()
  state.log.forEach((e, i) => {
    const covered =
      e.type === "scout"
        ? i < through.scouts
        : carriesPickVoice(e) && i < through.decisions
    if (covered && "voice" in e) for (const id of e.voice) ids.add(id)
  })
  return ids
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
export function hasArrived(state: JobsState, shareId: string): boolean {
  return state.log.some((e) => e.type === "arrived" && e.shareId === shareId)
}
