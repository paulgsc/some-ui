/**
 * What this phone saw happen as it ran (CK2, #2381; epic #2369): one event
 * per obligation it ran to an ending, saying how it ended, how long it took,
 * which screen it came from and which build, kept here until home holds it
 * (`lib/home-link/app-events`, through the outbox every record takes). Every
 * real use is then evidence, not only the paths someone thought to try.
 *
 * Takes today: every take of every screen on the take kit
 * (`@some-ui/voice-capture`'s `setTakeOutcomes`). A listening, a spoken line
 * and a note sent home go by the same event later, and ENGAGE's engagement
 * events (ENG2, #2535) as a second `family` beside `outcome`: one store, one
 * lane, one home route (`PUT /app-events/:id`) and one home table.
 *
 * What an event carries is the owner's C3 (#2369): the ending, timings and
 * the screen, by the code's own names. No audio, no words, no item content;
 * home refuses any field outside its family's own (paulgsc/server
 * `app_event_repo`, docs/identity.md invariant 33).
 *
 * Kept in the page's storage, so the Pages build's in-memory copy holds it
 * there (`lib/demo/viewer-storage`) and nothing is sent. At most
 * `APP_EVENTS_WAITING` wait; past that a new one is not kept, and the old
 * ones stay until home holds them: nothing waiting is let go before home has
 * it.
 */
import { isRecord } from "@some-ui/core-utils"
import type { TakeOutcome } from "@some-ui/voice-capture"
import { setTakeOutcomes } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"

const APP_EVENTS_KEY = "some-ui:app-events"

/** How many may wait for home; a new one past it is not kept. */
export const APP_EVENTS_WAITING = 500

/** How an ending reads: it worked, it failed, or the person stopped it. */
export type Went = "worked" | "failed" | "stopped"

/** One obligation run to an ending, in the form home keeps it. */
export type AppEvent = {
  readonly family: "outcome"
  /** This phone's id for it, so a retried send stores nothing new. */
  readonly id: string
  /** When it started, as an ISO 8601 instant. */
  readonly at: string
  /** The build's commit, when the build knows it. */
  readonly build: string | null
  /** The registry's process family (`packages/assurance`, `processes`). */
  readonly process: string
  readonly screen: string
  readonly ending: string
  readonly went: Went
  readonly readyMs: number | null
  readonly durationMs: number | null
  readonly peak: number | null
}

/**
 * Every take ending as the event names it, and how it reads. A take kept
 * but never heard (D4) reads as failed: a silent microphone is what a broken
 * one looks like (MIC0, #2370). A take refused because another screen holds
 * the microphone is the app keeping its rule, so it reads as stopped.
 */
export const TAKE_WENT = {
  kept: "worked",
  "kept-unheard": "failed",
  short: "stopped",
  early: "stopped",
  full: "failed",
  failed: "failed",
  "blocked-denied": "failed",
  "blocked-unsupported": "failed",
  "blocked-busy": "failed",
  "blocked-elsewhere": "stopped",
  "blocked-failed": "failed",
} as const satisfies Record<string, Went>

type TakeEndingId = keyof typeof TAKE_WENT

/** The registry's process family every take belongs to. */
const TAKE_PROCESS = "phone-recording"

/** The ending id a take's outcome names. */
function takeEndingId({ ended }: TakeOutcome): TakeEndingId {
  if (ended.ending === "blocked") return `blocked-${ended.reason ?? "failed"}`
  if (ended.ending === "kept" && ended.unheard) return "kept-unheard"
  return ended.ending
}

const roundPeak = (peak: number): number => Math.round(peak * 1_000) / 1_000

/** A take's outcome as an event: `now` stands in for a start not timed. */
export function takeEventOf(
  outcome: TakeOutcome,
  id: string,
  build: string | null,
  now: number
): AppEvent {
  const ending = takeEndingId(outcome)
  return {
    family: "outcome",
    id,
    at: new Date(outcome.startedAt ?? now).toISOString(),
    build,
    process: TAKE_PROCESS,
    screen: outcome.screen,
    ending,
    went: TAKE_WENT[ending],
    readyMs: outcome.readyMs,
    durationMs: outcome.durationMs,
    peak: outcome.peak === null ? null : roundPeak(outcome.peak),
  }
}

function isAppEvent(value: unknown): value is AppEvent {
  return (
    isRecord(value) &&
    value.family === "outcome" &&
    typeof value.id === "string" &&
    typeof value.at === "string" &&
    typeof value.process === "string" &&
    typeof value.screen === "string" &&
    typeof value.ending === "string" &&
    typeof value.went === "string"
  )
}

const waiting = boundedList(APP_EVENTS_KEY, APP_EVENTS_WAITING, isAppEvent)
const listeners = new Set<() => void>()
let snapshot: ReadonlyArray<AppEvent> | null = null
let revision = 0

function changed(): void {
  snapshot = null
  revision += 1
  for (const listener of listeners) listener()
}

/** The events waiting for home, newest first: the same array until one changes. */
export function appEventsWaiting(): ReadonlyArray<AppEvent> {
  snapshot ??= waiting.read()
  return snapshot
}

/** Moves each time an event is kept or let go: what asks the lane for a run. */
export function appEventsRevision(): number {
  return revision
}

export function subscribeAppEvents(listener: () => void): () => void {
  listeners.add(listener)
  return (): void => {
    listeners.delete(listener)
  }
}

/** Keeps `event` to wait for home; false when full or storage refuses. */
export function keepAppEvent(event: AppEvent): boolean {
  if (appEventsWaiting().length >= APP_EVENTS_WAITING) return false
  if (!waiting.put(event, (other) => other.id === event.id)) return false
  changed()
  return true
}

/** Lets go of the events home holds as they were sent, by id. */
export function letGoHeldAppEvents(ids: ReadonlySet<string>): void {
  if (ids.size === 0) return
  if (waiting.remove((event) => ids.has(event.id))) changed()
}

let installed = false

/**
 * Keeps every take's outcome from now on, under the build `build` names.
 * Once per page.
 */
export function installAppEvents(
  build: string | null = import.meta.env.VITE_BUILD_COMMIT || null
): void {
  if (installed) return
  installed = true
  setTakeOutcomes((outcome) => {
    keepAppEvent(takeEventOf(outcome, crypto.randomUUID(), build, Date.now()))
  })
}
