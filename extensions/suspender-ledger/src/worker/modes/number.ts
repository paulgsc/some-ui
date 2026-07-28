// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/modes/number.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import type { JsonValue } from "@some-extension/common/observability"
import { collectMeta } from "@suspender/content/meta"

import { discard } from "../core/discard"
import {
  CHECK_ALARM,
  clampCheckPeriodSeconds,
  count,
  noteCheckCompleted,
  obs,
  observe,
  record,
  safeOrigin,
} from "../core/observability"
import { storage } from "../core/prefs"
import { starters } from "../core/startup"
import { log, match, query } from "../core/utils"

/**
 * Time/count-based discard mode: an alarm periodically inspects open tabs and
 * suspends the oldest ones once their count exceeds the configured threshold,
 * subject to per-tab guards (audio, forms, whitelist, age, …).
 *
 * Notes on this port:
 *   - The upstream `plugins/loader` (`interrupts`) hook is out of scope and
 *     dropped.
 *   - The Chrome-only `chrome.app`-based content-script re-injection starter is
 *     dropped (Firefox has no `chrome.app`).
 *   - The Battery Status API gate is dropped (the API is deprecated and absent
 *     from Firefox).
 *   - Per-tab metadata is collected by the content layer's meta collector
 *     (ships with story #256); until then `executeScript` yields no meta and the
 *     affected tabs are skipped.
 */

/** Per-tab metadata returned by the injected meta collector. */
type TabMeta = {
  ready?: boolean
  time?: number
  forms?: boolean
  audible?: boolean
  paused?: boolean
  memory?: number
  permission?: boolean
}

/** Resolved configuration for a single `number.check` run. */
type CheckPrefs = {
  mode: string
  number: number
  "max.single.discard": number
  period: number
  audio: boolean
  paused: boolean
  pinned: boolean
  battery: boolean
  online: boolean
  form: boolean
  whitelist: Array<string>
  "notification.permission": boolean
  "whitelist-url": Array<string>
  "memory-enabled": boolean
  "memory-value": number
  idle: boolean
  "idle-timeout": number
  "exclude-active": boolean
  "icon-update": boolean
  "whitelist.session": Array<string>
  "ignore.meta.data"?: boolean
  "ignore.ready.state"?: boolean
}

/** A custom tab filter contributed by a plugin. */
type PluginFilter = {
  prepare(): Promise<void> | void
  check(tab: chrome.tabs.Tab): boolean
}

type NumberMode = {
  IGNORE: Partial<CheckPrefs>
  install(period: number): Promise<void>
  remove(): void
  check(
    filterTabsFrom?: ReadonlyArray<{ id?: number }>,
    ops?: Partial<CheckPrefs>,
    reason?: string
  ): Promise<void>
}

/** Float-tolerant cadence comparison — `periodInMinutes` is seconds/60. */
function closeEnough(a: number | undefined, b: number): boolean {
  return a !== undefined && Math.abs(a - b) < 1e-6
}

/**
 * Record the end of one sweep: duration into the aggregate, tallies into the
 * timeline. Every exit path from `check()` goes through here or through the
 * `check.skipped` branches, so a sweep that vanishes mid-flight is visible as
 * a `check.start` with no matching terminal event.
 */
function finish(
  startedAt: number,
  tally: {
    scanned: number
    ignored: number
    eligible: number
    selected: number
  }
): void {
  const duration = Date.now() - startedAt
  observe("check_duration_ms", duration)
  record("check.done", undefined, { ...tally, durationMs: duration })
}

/**
 * Read the currently-registered check alarm, or `undefined` when none exists.
 *
 * `alarms.get` is promise-shaped on Firefox and promise-or-callback on Chrome;
 * the shared wrapper keeps the two call sites (install, watchdog) honest and
 * swallows a rejection as "no alarm", which is the safe reading — a scheduler
 * we cannot see is a scheduler we must re-create.
 */
async function getCheckAlarm(): Promise<chrome.alarms.Alarm | undefined> {
  try {
    const alarm = await chrome.alarms.get(CHECK_ALARM)
    // The typings mark the result non-optional; at runtime it is absent when
    // no alarm is registered.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return alarm ?? undefined
  } catch {
    return undefined
  }
}

const ICONS: Record<string, string> = {
  "16": "assets/icon-16.png",
  "48": "assets/icon-48.png",
}

/** Defensively coerce an injected script result into a `TabMeta`. */
function readMeta(value: unknown): TabMeta {
  if (value === null || typeof value !== "object") {
    return {}
  }
  const time = Reflect.get(value, "time")
  const memory = Reflect.get(value, "memory")
  return {
    ready: Reflect.get(value, "ready") === true,
    time: typeof time === "number" ? time : undefined,
    forms: Reflect.get(value, "forms") === true,
    audible: Reflect.get(value, "audible") === true,
    paused: Reflect.get(value, "paused") === true,
    memory: typeof memory === "number" ? memory : undefined,
    permission: Reflect.get(value, "permission") === true,
  }
}

const number: NumberMode = {
  IGNORE: {
    idle: false,
    battery: false,
    online: false,
    number: 0,
    period: 0,
    "max.single.discard": Infinity,
    "ignore.meta.data": true,
  },
  /**
   * Ensure the periodic sweep alarm exists — **without resetting it** when it
   * already does.
   *
   * This idempotency is the fix for the sporadic "tabs never get suspended"
   * bug, and the reason it is load-bearing is worth spelling out.
   *
   * `install` is called from a `starters` callback, and `starters` run at
   * module evaluation on *every* worker generation (see `core/startup.ts`:
   * MV3 event pages are recycled aggressively, and neither `onStartup` nor
   * `onInstalled` fires on a respawn, so the gate has to open unconditionally).
   * The previous implementation unconditionally called `alarms.create` with
   * `when: Date.now() + period`, which **re-armed the alarm from zero on every
   * respawn**.
   *
   * The extension registers `tabs.onUpdated`, `tabs.onActivated`,
   * `runtime.onMessage` and friends — so during active browsing the event page
   * is woken every few seconds. Each wake pushed the next sweep another full
   * interval into the future, so the alarm could only ever fire during a lull
   * longer than the whole interval. Hence the symptom: suspension works fine
   * on an idle machine and silently never happens while you are actually using
   * the browser — sporadic, unreproducible on demand, and invisible in logs
   * because nothing was failing. Nothing *ran*.
   *
   * So: create the alarm only when it is missing or its cadence changed.
   */
  async install(period) {
    const seconds = clampCheckPeriodSeconds(period)
    const periodInMinutes = seconds / 60
    const existing = await getCheckAlarm()

    if (existing && closeEnough(existing.periodInMinutes, periodInMinutes)) {
      count("alarm_kept")
      record("alarm.kept", CHECK_ALARM, {
        scheduledTime: existing.scheduledTime,
        periodInMinutes,
        dueInMs: existing.scheduledTime - Date.now(),
      })
      obs.setSnapshot("alarm:check", {
        scheduledTime: existing.scheduledTime,
        periodInMinutes,
        origin: "kept",
      })
      return
    }

    const when = Date.now() + seconds * 1000
    void chrome.alarms.create(CHECK_ALARM, { when, periodInMinutes })
    count("alarm_installs")
    record("alarm.installed", CHECK_ALARM, {
      when,
      periodInMinutes,
      replaced: existing
        ? { periodInMinutes: existing.periodInMinutes ?? null }
        : null,
    })
    obs.setSnapshot("alarm:check", {
      scheduledTime: when,
      periodInMinutes,
      origin: "installed",
    })
  },
  remove() {
    void chrome.alarms.clear(CHECK_ALARM)
    record("alarm.cleared", CHECK_ALARM)
    obs.deleteSnapshot("alarm:check")
  },
  async check(filterTabsFrom, ops = {}, reason) {
    log("number.check is called", reason)
    const startedAt = Date.now()
    count("checks_run")
    record("check.start", reason ?? "manual")
    // Noted at the *start*: what the CheckRanRecently invariant is really
    // asking is "did the scheduler wake us", and a sweep that skips out early
    // (machine not idle, tab count below threshold) answers that just as well
    // as one that suspends something.
    noteCheckCompleted(startedAt)

    const base = await storage<Omit<CheckPrefs, "whitelist.session">>({
      mode: "time-based",
      number: 6,
      "max.single.discard": 50,
      period: 10 * 60,
      audio: true,
      paused: false,
      pinned: false,
      battery: false,
      online: false,
      form: true,
      whitelist: [],
      "notification.permission": false,
      "whitelist-url": [],
      "memory-enabled": false,
      "memory-value": 60,
      idle: false,
      "idle-timeout": 5 * 60,
      "exclude-active": true,
      "icon-update": false,
    })
    const session = await storage<{ "whitelist.session": Array<string> }>(
      { "whitelist.session": [] },
      "session"
    )
    const prefs: CheckPrefs = { ...base, ...session, ...ops }

    // only check if idle
    if (prefs.idle) {
      const state = await new Promise<chrome.idle.IdleState>((resolve) =>
        chrome.idle.queryState(prefs["idle-timeout"], resolve)
      )
      if (state !== "idle") {
        log("discarding is skipped", "not in the idle state")
        count("checks_skipped")
        record("check.skipped", reason ?? "manual", { why: "machine-not-idle" })
        return
      }
    }
    // only check if INTERNET is connected
    if (prefs.online && navigator.onLine === false) {
      log("discarding is skipped", "No INTERNET connection detected")
      count("checks_skipped")
      record("check.skipped", reason ?? "manual", { why: "offline" })
      return
    }

    const options: chrome.tabs.QueryInfo = {
      url: "*://*/*",
      discarded: false,
    }
    if (prefs["exclude-active"]) {
      options.active = false
    }
    if (prefs.pinned) {
      options.pinned = false
    }
    if (prefs.audio) {
      options.audible = false
    }
    let tbs = await query(options)
    count("tabs_scanned", tbs.length)

    /** Record why one tab was passed over. The "why wasn't this tab suspended?"
     *  question is answered entirely from these events. */
    const skipped = (
      tb: chrome.tabs.Tab,
      why: string,
      extra: Record<string, JsonValue> = {}
    ): void => {
      count("tabs_skipped")
      record("tab.skipped", tb.id, {
        why,
        origin: safeOrigin(tb.url),
        ...extra,
      })
    }

    const icon = (tb: chrome.tabs.Tab, title: string): void => {
      void chrome.action.setTitle({ tabId: tb.id, title })
      void chrome.action.setIcon({ tabId: tb.id, path: ICONS })
    }
    icon.reset = (tb: chrome.tabs.Tab): void => {
      void chrome.action.setTitle({
        tabId: tb.id,
        title: chrome.runtime.getManifest().name,
      })
      void chrome.action.setIcon({ tabId: tb.id, path: ICONS })
    }

    // remove tabs based on custom filters
    for (const { prepare, check } of Object.values(pluginFilters)) {
      await prepare()
      tbs = tbs.filter(check)
    }

    // remove tabs that match one of the matching lists
    let exceptionCount = 0
    if (
      prefs.whitelist.length ||
      prefs["whitelist.session"].length ||
      (prefs.mode === "url-based" && prefs["whitelist-url"].length)
    ) {
      tbs = tbs.filter((tb) => {
        try {
          if (!tb.url) {
            return false
          }
          const { hostname } = new URL(tb.url)
          const m = (list: Array<string>): boolean =>
            match(list, hostname, tb.url ?? "")
          if (
            prefs.mode === "url-based" &&
            m(prefs["whitelist-url"]) !== true
          ) {
            icon(tb, "tab is in the whitelist")
            log("number.check", "tab is ignored", "url-based whitelist", tb.url)
            skipped(tb, "url-whitelist")
            exceptionCount += 1
            return false
          }
          if (m(prefs.whitelist) || m(prefs["whitelist.session"])) {
            icon(tb, "tab is in the session or permanent whitelist")
            log("number.check", "tab is ignored", "whitelist", tb.url)
            skipped(tb, "whitelist")
            exceptionCount += 1
            return false
          }
          return true
        } catch {
          return false
        }
      })
    }
    if (filterTabsFrom?.length) {
      const ids = filterTabsFrom.map((t) => t.id)
      tbs = tbs.filter((tb) => ids.includes(tb.id))
    }

    // do not discard if number of tabs is smaller than required
    if (prefs["icon-update"] === false) {
      if (tbs.length + exceptionCount <= prefs.number) {
        log(
          "number.check",
          "tab count below threshold",
          tbs.length,
          prefs.number
        )
        count("checks_skipped")
        record("check.skipped", reason ?? "manual", {
          why: "below-tab-threshold",
          candidates: tbs.length,
          ignored: exceptionCount,
          threshold: prefs.number,
        })
        return
      }
    }

    const now = Date.now()
    const map = new Map<chrome.tabs.Tab, TabMeta>()
    const arr: Array<chrome.tabs.Tab> = []
    for (const tb of tbs) {
      if (tb.id === undefined) {
        continue
      }
      try {
        // An injection failure used to be swallowed whole (`() => []`), which
        // made "this tab is silently never eligible" indistinguishable from
        // "this tab is fine". Keep the same non-fatal behaviour, but keep the
        // reason.
        let injectionError: string | undefined
        const results =
          tb.status === "unloaded"
            ? []
            : await chrome.scripting
                .executeScript({
                  target: { tabId: tb.id, allFrames: true },
                  // Inject the collector as a function, not a bundled file: a
                  // bundler tree-shakes the file's completion-value payload.
                  func: collectMeta,
                })
                .then(
                  (r) => r,
                  (e: unknown) => {
                    injectionError = e instanceof Error ? e.message : String(e)
                    return []
                  }
                )
        if (injectionError !== undefined) {
          count("meta_errors")
          record("tab.meta_error", tb.id, {
            origin: safeOrigin(tb.url),
            status: tb.status ?? null,
            error: injectionError,
          })
        }
        const ms: Array<TabMeta> = results.map((o) => readMeta(o.result))

        // remove protected tabs (e.g. addons.mozilla.org)
        if (ms.length === 0) {
          if (
            ops["ignore.meta.data"] === true &&
            tb.url?.startsWith("http") !== true
          ) {
            log("discarding aborted", "metadata fetch error", tb.url)
            icon(tb, "metadata fetch error")
            skipped(tb, "metadata-unavailable", { status: tb.status ?? null })
            exceptionCount += 1
            continue
          }
        }
        const meta: TabMeta = Object.assign({}, ...ms)
        meta.forms = ms.some((o) => o.forms === true)
        meta.audible = ms.some((o) => o.audible === true)
        meta.paused = ms.some((o) => o.paused === true)

        // Child iframes lack watch.ts so their time defaults to Date.now().
        // Object.assign's last-wins would overwrite the main frame's meaningful
        // lastVisit when allFrames:true is used, making every tab look too young.
        // Restore main-frame time explicitly.
        const mainFrame = results.find((r) => r.frameId === 0)
        if (mainFrame !== undefined) {
          const mainMeta = readMeta(mainFrame.result)
          if (typeof mainMeta.time === "number") {
            meta.time = mainMeta.time
          }
        }

        // using too much memory => discard instantly
        if (
          prefs["memory-enabled"] &&
          meta.memory &&
          meta.memory > prefs["memory-value"] * 1024 * 1024
        ) {
          log("forced discarding", "memory usage")
          record("suspend.requested", tb.id, {
            trigger: "memory-pressure",
            origin: safeOrigin(tb.url),
          })
          void discard(tb)
          continue
        }
        if (meta.ready !== true && ops["ignore.ready.state"] !== true) {
          log("discarding aborted", "tab is not ready", tb)
          skipped(tb, "not-ready", { status: tb.status ?? null })
          exceptionCount += 1
          continue
        }
        if (prefs.audio && meta.audible) {
          log("discarding aborted", "audio is playing", tb)
          icon(tb, "tab plays an audio")
          skipped(tb, "audible")
          exceptionCount += 1
          continue
        }
        if (prefs.paused && meta.paused) {
          log("discarding aborted", "player is paused", tb)
          icon(tb, "tab has a paused player")
          skipped(tb, "paused-media")
          exceptionCount += 1
          continue
        }
        if (prefs.form && meta.forms) {
          log("discarding aborted", "active form", tb)
          icon(tb, "there is an active form on this tab")
          skipped(tb, "unsaved-form")
          exceptionCount += 1
          continue
        }
        if (prefs["notification.permission"] && meta.permission) {
          log("discarding aborted", "tab has notification permission")
          icon(tb, "tab has notification permission")
          skipped(tb, "notification-permission")
          exceptionCount += 1
          continue
        }
        if (tb.autoDiscardable === false) {
          log("discarding aborted", "tab is not discardable", tb)
          skipped(tb, "not-auto-discardable")
          exceptionCount += 1
          icon(tb, "tab is not discardable")
          continue
        }
        if (now - (meta.time ?? tb.lastAccessed ?? now) < prefs.period * 1000) {
          log("discarding aborted", "tab is not old", tb)
          skipped(tb, "too-young", {
            ageMs: now - (meta.time ?? tb.lastAccessed ?? now),
            thresholdMs: prefs.period * 1000,
            ageSource:
              meta.time !== undefined ? "content-script" : "lastAccessed",
          })
          exceptionCount += 1
          icon.reset(tb)
          continue
        }
        if (tb.active) {
          log("discarding aborted", "tab is active", tb)
          skipped(tb, "active")
          exceptionCount += 1
          icon.reset(tb)
          continue
        }
        map.set(tb, meta)
        arr.push(tb)
        if (arr.length > prefs["max.single.discard"]) {
          log("number.check", "breaking", "max number of tabs reached")
          break
        }
      } catch (e) {
        log("number.check error", e)
        count("check_errors")
        record(
          "check.error",
          tb.id,
          { error: e instanceof Error ? e.message : String(e) },
          "error"
        )
      }
    }

    if (prefs["icon-update"] === true) {
      if (tbs.length + exceptionCount <= prefs.number) {
        log(
          "number.check",
          "tab count below threshold",
          tbs.length,
          prefs.number
        )
        count("checks_skipped")
        record("check.skipped", reason ?? "manual", {
          why: "below-tab-threshold",
          candidates: tbs.length,
          ignored: exceptionCount,
          threshold: prefs.number,
        })
        return
      }
    }

    // ready to discard
    log("number check", "tabs that are ignored", exceptionCount)
    log("number check", "possible tabs that could get discarded", arr.length)
    const tbds = arr
      .sort((a, b) => (map.get(a)?.time ?? 0) - (map.get(b)?.time ?? 0))
      .slice(
        0,
        Math.min(
          arr.length + exceptionCount - prefs.number,
          prefs["max.single.discard"]
        )
      )

    log("number check", "discarding", tbds.length)
    count("tabs_selected", tbds.length)
    for (const tb of tbds) {
      record("suspend.requested", tb.id, {
        trigger: reason ?? "manual",
        origin: safeOrigin(tb.url),
        ageMs: now - (map.get(tb)?.time ?? now),
      })
      void discard(tb)
    }
    finish(startedAt, {
      scanned: tbs.length,
      ignored: exceptionCount,
      eligible: arr.length,
      selected: tbds.length,
    })
  },
}

/** Registry of custom tab filters contributed by plugins (empty by default). */
const pluginFilters: Record<string, PluginFilter> = {}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    log("alarm fire", CHECK_ALARM, alarm.name)
    const now = Date.now()
    count("alarm_fires")

    // Interval between consecutive fires is the single most diagnostic number
    // this extension has: it is the difference between "the scheduler is
    // running" and "the scheduler exists but never gets to run". The gap that
    // exposed the deferred-alarm bug is visible here as a fire interval that
    // simply never arrives.
    const previous = readNumberSnapshot("alarm:lastFire")
    if (previous !== undefined) {
      const interval = now - previous
      observe("alarm_interval_ms", interval)
      const expected = alarm.periodInMinutes
        ? alarm.periodInMinutes * 60 * 1000
        : undefined
      if (expected !== undefined && interval > expected * 2) {
        count("alarm_missed")
        record(
          "alarm.missed",
          CHECK_ALARM,
          { intervalMs: interval, expectedMs: expected },
          "warn"
        )
      }
    }
    obs.setSnapshot("alarm:lastFire", now)
    record("alarm.fired", CHECK_ALARM, {
      scheduledTime: alarm.scheduledTime,
      lateByMs: now - alarm.scheduledTime,
      periodInMinutes: alarm.periodInMinutes ?? null,
    })

    // Re-arm after firing. This is safe where `install` was not: it happens at
    // fire time, not at every worker wake, so it advances the schedule by
    // exactly one interval rather than deferring it indefinitely.
    if (alarm.periodInMinutes) {
      void chrome.alarms.create(alarm.name, {
        when: now + alarm.periodInMinutes * 60 * 1000,
        periodInMinutes: alarm.periodInMinutes,
      })
    }
    void number.check(undefined, undefined, "number/1")
  }
})

/** Read a numeric recorder snapshot, or undefined when absent/not a number. */
function readNumberSnapshot(key: string): number | undefined {
  const value = obs.snapshotEntries()[key]
  return typeof value === "number" ? value : undefined
}

/**
 * Watchdog: on every worker generation, notice a sweep that should already
 * have happened and run it now.
 *
 * Defence in depth behind the `install` fix. An alarm can also be lost to a
 * crash, a profile restore, or a browser bug — and the failure mode is
 * completely silent, because nothing errors when a timer simply never fires.
 * The cost of being wrong here is one extra sweep; the cost of not checking is
 * the bug this patch exists to fix, back again by another route.
 */
async function watchdog(periodSeconds: number): Promise<void> {
  const intervalMs = clampCheckPeriodSeconds(periodSeconds) * 1000
  const alarm = await getCheckAlarm()
  const now = Date.now()

  if (!alarm) {
    // `install` runs alongside this and will create it; the sweep it would
    // have performed is what we owe the user right now.
    count("alarm_repairs")
    record("alarm.repaired", CHECK_ALARM, { why: "absent" }, "warn")
    void number.check(undefined, undefined, "watchdog/absent")
    return
  }

  const overdueBy = now - alarm.scheduledTime
  if (overdueBy > intervalMs) {
    count("alarm_repairs")
    record(
      "alarm.repaired",
      CHECK_ALARM,
      { why: "overdue", overdueBy, intervalMs },
      "warn"
    )
    void chrome.alarms.create(CHECK_ALARM, {
      when: now + intervalMs,
      periodInMinutes: intervalMs / 60_000,
    })
    void number.check(undefined, undefined, "watchdog/overdue")
  }
}

// fix outdated alarms when the machine wakes up
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "active") {
    const now = Date.now()
    chrome.alarms.getAll((alarms) => {
      for (const o of alarms) {
        if (o.scheduledTime < now) {
          void chrome.alarms.create(o.name, {
            when: now + Math.round(Math.random() * 10000),
            periodInMinutes: o.periodInMinutes,
          })
        }
      }
    })
  }
})

/* start: install/remove the alarm based on mode */
{
  /** Resolves with the active age threshold, or undefined when disabled. */
  const check = (): Promise<number | undefined> =>
    storage<{ mode: string; period: number; tmp_disable: number }>({
      mode: "time-based",
      period: 10 * 60,
      tmp_disable: 0,
    }).then(async (ps) => {
      if (
        ps.period &&
        (ps.mode === "time-based" || ps.mode === "url-based") &&
        ps.tmp_disable === 0
      ) {
        await number.install(ps.period)
        return ps.period
      }
      number.remove()
      return undefined
    })
  starters.push(() => {
    void check().then(async (period) => {
      if (period !== undefined) {
        await watchdog(period)
      }
    })
  })
  chrome.storage.onChanged.addListener((ps) => {
    if (ps.period || ps.mode || ps.tmp_disable) {
      void check()
    }
  })
}

/* temporarily disable auto discarding */
{
  const exit = (): void => {
    void chrome.action.setIcon({ path: ICONS })
    void chrome.action.setTitle({ title: chrome.i18n.getMessage("bg_msg_2") })
  }
  chrome.storage.onChanged.addListener((ps) => {
    const change = ps.tmp_disable
    if (change) {
      if (change.newValue !== 0) {
        void chrome.alarms.create("tmp.disable", {
          when: Date.now() + change.newValue * 60 * 60 * 1000,
        })
        exit()
      } else {
        void chrome.alarms.clear("tmp.disable")
        void chrome.action.setIcon({ path: ICONS })
        void chrome.action.setTitle({
          title: chrome.runtime.getManifest().name,
        })
      }
    }
  })
  starters.push(() => {
    void storage<{ tmp_disable: number }>({ tmp_disable: 0 }).then((ps) => {
      if (ps.tmp_disable) {
        chrome.alarms.get("tmp.disable", (a) => {
          // the typings mark the alarm non-optional, but it is absent at runtime
          // when no timer is installed
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (a) {
            exit()
          } else {
            log("tmp timer absent; re-enabling the numbered module")
            void chrome.storage.local.set({ tmp_disable: 0 })
          }
        })
      }
    })
  })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "tmp.disable") {
      void chrome.storage.local.set({ tmp_disable: 0 })
    }
  })
}

export { number, pluginFilters }
