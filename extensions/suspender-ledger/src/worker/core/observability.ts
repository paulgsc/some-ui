// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * suspender-ledger's observability adapter — the reference implementation of
 * the workspace-shared flight recorder (`@some-extension/common/observability`).
 *
 * Everything generic (ring buffer, metrics, invariant runner, persistence,
 * health scoring) lives in the shared package. This file supplies only what is
 * genuinely suspender-specific:
 *
 *   - the event-kind union — what decisions this extension makes;
 *   - the counter/aggregate names — what "is it working?" means here;
 *   - the invariants — what must always be true of a tab suspender;
 *   - the context collector that feeds them from the browser.
 *
 * Adapting a second extension means writing this file again, ~200 lines, and
 * nothing else. That is the seam.
 *
 * ## Scope discipline (AMO)
 *
 * Nothing recorded here leaves the machine: there is no network path in this
 * module or the package behind it. Tab URLs are recorded as **origin only**
 * (see {@link safeOrigin}) — the diagnostic questions this exists to answer
 * ("why wasn't this tab suspended?") are answerable from the origin and the
 * skip reason, and a full URL with its query string is browsing content we
 * have no business writing to disk.
 */

import {
  extensionStoragePersistence,
  Recorder,
  type DiagnosticsBundle,
  type HealthReport,
  type Invariant,
  type InvariantOutcome,
  type JsonValue,
} from "@some-extension/common/observability"

import { prefs } from "./prefs"

/** The alarm that drives periodic suspend checks. */
export const CHECK_ALARM = "number.check"

/** Storage key for the persisted flight recorder (workspace-prefixed). */
const STORAGE_KEY = "sl.observability.v1"

/**
 * Every decision this extension makes, as a closed union. Closed on purpose:
 * the debug page filters on these, and a stringly-typed `kind` would let a new
 * call site go un-renderable without a compile error.
 */
export type SuspenderEventKind =
  // worker lifecycle
  | "worker.start"
  // the scheduler — the subsystem the sporadic no-suspend bug lived in
  | "alarm.installed"
  | "alarm.kept"
  | "alarm.cleared"
  | "alarm.fired"
  | "alarm.missed"
  | "alarm.repaired"
  // one periodic sweep
  | "check.start"
  | "check.skipped"
  | "check.done"
  | "check.error"
  | "tab.skipped"
  | "tab.meta_error"
  // one tab's suspend lifecycle
  | "suspend.requested"
  | "suspend.queued"
  | "suspend.marked"
  | "suspend.discarded"
  | "suspend.noop"
  | "suspend.failed"
  | "suspend.rolled_back"
  // domain FSM
  | "fsm.transition"
  | "fsm.violation"
  // ground truth from the browser
  | "browser.tab_updated"
  | "browser.tab_removed"
  | "reconcile.activated"
  | "reconcile.repaired"
  /** Free-form passthrough for `trace()` call sites not yet given a kind. */
  | "trace"

export type SuspenderCounter =
  | "worker_starts"
  | "alarm_installs"
  | "alarm_kept"
  | "alarm_fires"
  | "alarm_missed"
  | "alarm_repairs"
  | "checks_run"
  | "checks_skipped"
  | "check_errors"
  | "tabs_scanned"
  | "tabs_selected"
  | "tabs_skipped"
  | "meta_errors"
  | "suspend_attempts"
  | "suspend_succeeded"
  | "suspend_noop"
  | "suspend_failed"
  | "suspend_rolled_back"
  | "suspend_queued"
  | "fsm_violations"
  | "reconcile_repairs"

export type SuspenderAggregate =
  | "suspend_latency_ms"
  | "check_duration_ms"
  | "alarm_interval_ms"

// ── Invariants ───────────────────────────────────────────────────────────────
//
// Checks are pure functions of a context object. Gathering that context (which
// needs the browser) is {@link collectInvariantContext}'s job, so each check
// below is unit-testable with a plain object literal.

/** Everything the invariants need to know, gathered once per evaluation. */
export type InvariantContext = {
  now: number
  /** Whether periodic suspending is supposed to be running at all. */
  schedulingEnabled: boolean
  /** Configured sweep interval in ms (0 when scheduling is off). */
  expectedIntervalMs: number
  /** `scheduledTime` of the check alarm, or undefined when it does not exist. */
  alarmScheduledTime: number | undefined
  /** Epoch ms of the last completed sweep, if one has run since install. */
  lastCheckAt: number | undefined
  /** The configured title marker; "" disables marking entirely. */
  marker: string
  tabs: ReadonlyArray<{
    id: number | undefined
    active: boolean
    discarded: boolean
    title: string | undefined
  }>
  /** Tab ids the orchestrator currently considers mid-suspend, with start time. */
  inFlight: ReadonlyArray<{ tabId: number; startedAt: number }>
}

/** A suspend that has been in flight this long is stuck, not slow. */
const STUCK_SUSPEND_MS = 60_000

const violated = (details: JsonValue): InvariantOutcome => ({
  ok: false,
  details,
})

export const suspenderInvariants: ReadonlyArray<Invariant<InvariantContext>> = [
  {
    name: "SchedulerAlarmExists",
    description:
      "While periodic suspending is enabled, the number.check alarm must exist — without it no sweep ever runs.",
    check: (ctx): InvariantOutcome => {
      if (!ctx.schedulingEnabled) {
        return { ok: true }
      }
      return ctx.alarmScheduledTime === undefined
        ? violated({ reason: "no number.check alarm registered" })
        : { ok: true }
    },
  },
  {
    name: "SchedulerAlarmNotStale",
    description:
      "The check alarm's scheduled time must not be far in the past — a long-overdue alarm means the event page is not being woken.",
    check: (ctx): InvariantOutcome => {
      if (!ctx.schedulingEnabled || ctx.alarmScheduledTime === undefined) {
        return { ok: "unknown" }
      }
      const overdueBy = ctx.now - ctx.alarmScheduledTime
      return overdueBy > ctx.expectedIntervalMs
        ? violated({ overdueBy, expectedIntervalMs: ctx.expectedIntervalMs })
        : { ok: true }
    },
  },
  {
    name: "CheckRanRecently",
    description:
      "A sweep must have completed within three intervals. This is the invariant that catches a perpetually-deferred alarm.",
    check: (ctx): InvariantOutcome => {
      if (!ctx.schedulingEnabled || ctx.expectedIntervalMs <= 0) {
        return { ok: "unknown" }
      }
      if (ctx.lastCheckAt === undefined) {
        // No sweep since install/hydrate is normal for a fresh profile.
        return { ok: "unknown" }
      }
      const since = ctx.now - ctx.lastCheckAt
      return since > ctx.expectedIntervalMs * 3
        ? violated({
            msSinceLastCheck: since,
            expectedIntervalMs: ctx.expectedIntervalMs,
          })
        : { ok: true }
    },
  },
  {
    name: "NoActiveTabSuspended",
    description:
      "The tab the user is looking at must never be in the discarded state.",
    check: (ctx): InvariantOutcome => {
      const offenders = ctx.tabs
        .filter((t) => t.active && t.discarded)
        .map((t) => t.id ?? -1)
      return offenders.length > 0
        ? violated({ tabIds: offenders })
        : { ok: true }
    },
  },
  {
    name: "NoStrandedMarkerOnLiveTab",
    description:
      "A live (non-discarded) tab must not wear the sleep marker — that is a rolled-back suspend that never got cleaned up.",
    check: (ctx): InvariantOutcome => {
      if (!ctx.marker) {
        return { ok: "unknown" }
      }
      const prefix = `${ctx.marker} `
      const offenders = ctx.tabs
        .filter((t) => !t.discarded && t.title?.startsWith(prefix) === true)
        .map((t) => t.id ?? -1)
      return offenders.length > 0
        ? violated({ tabIds: offenders })
        : { ok: true }
    },
  },
  {
    name: "NoStuckInFlightSuspend",
    description:
      "No tab may sit in the in-progress set for more than a minute; a suspend that never settles blocks every later attempt on that tab.",
    check: (ctx): InvariantOutcome => {
      const stuck = ctx.inFlight
        .filter((e) => ctx.now - e.startedAt > STUCK_SUSPEND_MS)
        .map((e) => ({ tabId: e.tabId, forMs: ctx.now - e.startedAt }))
      return stuck.length > 0 ? violated({ stuck }) : { ok: true }
    },
  },
]

// ── The recorder ─────────────────────────────────────────────────────────────

/**
 * Live probe into the orchestrator's in-memory state. Registered by
 * `discard.ts` at import time rather than imported from it, because
 * `discard.ts` records events into this module — importing back would be a
 * cycle. The seam also keeps the invariants honest: they read a snapshot, they
 * cannot reach in and mutate anything.
 */
type StateProbe = () => {
  inFlight: Array<{ tabId: number; startedAt: number }>
}

let stateProbe: StateProbe = () => ({ inFlight: [] })

export function registerStateProbe(probe: StateProbe): void {
  stateProbe = probe
}

/** Epoch ms of the last sweep. Mirrored into a snapshot so it survives the
 *  worker being recycled — an in-memory-only value would reset on every
 *  respawn and make the CheckRanRecently invariant permanently blind. */
let lastCheckAt: number | undefined

export function noteCheckCompleted(at: number): void {
  lastCheckAt = at
  obs.setSnapshot("check:last", at)
}

/**
 * Restore the recorder from disk, then re-derive the in-memory mirrors that
 * are computed from it. Call once, from a `starters` callback: MV3 event pages
 * are recycled constantly, and a recorder that starts empty every generation
 * measures the worker's lifetime rather than the extension's.
 */
export async function hydrateObservability(): Promise<void> {
  await obs.hydrate()
  const stored = obs.snapshotEntries()["check:last"]
  if (typeof stored === "number") {
    lastCheckAt = stored
  }
}

export const obs = new Recorder<
  SuspenderEventKind,
  SuspenderCounter,
  SuspenderAggregate,
  InvariantContext
>({
  namespace: "suspender-ledger",
  // ~500 events is several hours of a busy profile's decisions, and stays
  // well inside the persistence port's byte budget.
  capacity: 500,
  invariants: suspenderInvariants,
  persistence: extensionStoragePersistence({ key: STORAGE_KEY }),
  // The console echo is opt-in behind the existing `log` preference — an
  // always-on firehose is its own kind of bad citizenship, and the timeline is
  // on the debug page regardless.
  echo: (event): void => {
    if (!prefs.log) {
      return
    }
    // eslint-disable-next-line no-console -- gated on the user's own log preference
    console.debug(
      `[SL#${event.seq}] ${event.kind}`,
      event.subject ?? "",
      event.detail ?? ""
    )
  },
})

// ── Recording helpers ────────────────────────────────────────────────────────

/**
 * Record one event. Thin, but it keeps every call site in the worker free of
 * the recorder's option-object shape.
 */
export function record(
  kind: SuspenderEventKind,
  subject?: number | string,
  detail?: JsonValue,
  severity?: "debug" | "info" | "warn" | "error"
): void {
  obs.record({ kind, subject, detail, severity })
}

export function count(name: SuspenderCounter, by = 1): void {
  obs.count(name, by)
}

export function observe(name: SuspenderAggregate, value: number): void {
  obs.observe(name, value)
}

/**
 * Origin (scheme + host) of a URL, or a coarse label when it has none.
 * Deliberately lossy: this is the most tab identity that belongs on disk.
 */
export function safeOrigin(url: string | undefined): string {
  if (!url) {
    return "(none)"
  }
  try {
    return new URL(url).origin
  } catch {
    return "(opaque)"
  }
}

/** Publish what the extension currently believes about one tab. */
export function snapshotTab(
  tabId: number,
  state: {
    fsm?: string
    discarded?: boolean
    active?: boolean
    origin?: string
    lastAttemptAt?: number
    outcome?: string
  }
): void {
  obs.setSnapshot(`tab:${tabId}`, { tabId, ...state, at: Date.now() })
}

export function forgetTab(tabId: number): void {
  obs.deleteSnapshot(`tab:${tabId}`)
}

// ── Health and export ────────────────────────────────────────────────────────

/**
 * Gather the browser-side facts the invariants run against. Failures degrade
 * to "unknown" rather than propagating: a health check that throws would be a
 * worse outcome than one that admits it does not know.
 */
export async function collectInvariantContext(): Promise<InvariantContext> {
  const now = Date.now()
  const stored = await readSchedulingPrefs()
  const schedulingEnabled =
    stored.period > 0 &&
    (stored.mode === "time-based" || stored.mode === "url-based") &&
    stored.tmp_disable === 0

  let alarmScheduledTime: number | undefined
  try {
    const alarm = await chrome.alarms.get(CHECK_ALARM)
    // The typings mark the result non-optional; it is absent at runtime when
    // no alarm is registered — which is precisely what this reads.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    alarmScheduledTime = alarm ? alarm.scheduledTime : undefined
  } catch {
    alarmScheduledTime = undefined
  }

  const tabs = await readTabs()

  return {
    now,
    schedulingEnabled,
    expectedIntervalMs: schedulingEnabled ? checkIntervalMs(stored.period) : 0,
    alarmScheduledTime,
    lastCheckAt,
    marker: prefs.prepends,
    tabs,
    inFlight: stateProbe().inFlight,
  }
}

/**
 * The effective sweep interval for a configured age threshold, in ms.
 *
 * Shared with `modes/number.ts` so the scheduler and the invariant that judges
 * the scheduler can never disagree about what "on time" means — the kind of
 * quiet drift that makes a health check lie.
 */
export function checkIntervalMs(periodSeconds: number): number {
  return clampCheckPeriodSeconds(periodSeconds) * 1000
}

/** Clamp a configured age threshold to the sweep cadence: 1–20 minutes. */
export function clampCheckPeriodSeconds(periodSeconds: number): number {
  return Math.min(20 * 60, Math.max(60, periodSeconds / 3))
}

/** Current tabs, reduced to the fields the invariants judge. */
async function readTabs(): Promise<InvariantContext["tabs"]> {
  try {
    const queried = await chrome.tabs.query({})
    return queried.map((t) => ({
      id: t.id,
      active: t.active,
      discarded: t.discarded === true,
      title: t.title,
    }))
  } catch {
    // A failed query means the checks that need tabs report "unknown" rather
    // than inventing a clean bill of health from an empty list.
    return []
  }
}

async function readSchedulingPrefs(): Promise<{
  mode: string
  period: number
  tmp_disable: number
}> {
  const fallback = { mode: "time-based", period: 10 * 60, tmp_disable: 0 }
  try {
    const stored: unknown = await new Promise((resolve) =>
      chrome.storage.local.get(fallback, resolve)
    )
    if (stored === null || typeof stored !== "object") {
      return fallback
    }
    const mode = Reflect.get(stored, "mode")
    const period = Reflect.get(stored, "period")
    const tmpDisable = Reflect.get(stored, "tmp_disable")
    return {
      mode: typeof mode === "string" ? mode : fallback.mode,
      period: typeof period === "number" ? period : fallback.period,
      tmp_disable: typeof tmpDisable === "number" ? tmpDisable : 0,
    }
  } catch {
    return fallback
  }
}

/** The extension's own answer to "am I working?". */
export async function healthReport(): Promise<HealthReport> {
  return obs.health(await collectInvariantContext())
}

/**
 * The user-attachable diagnostics bundle (the "export debug report" action).
 *
 * String-kinded rather than `DiagnosticsBundle<SuspenderEventKind>`: the
 * timeline inside may have been written by an older build of this extension
 * whose event names differ from today's union, and claiming otherwise would be
 * a promise the storage boundary cannot keep.
 */
export async function exportDiagnostics(): Promise<DiagnosticsBundle> {
  const manifest = chrome.runtime.getManifest()
  return obs.export(await collectInvariantContext(), {
    extension: { name: manifest.name, version: manifest.version },
    runtime: {
      userAgent:
        typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    },
  })
}
