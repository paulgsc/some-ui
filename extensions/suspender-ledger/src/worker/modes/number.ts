// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/modes/number.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { discard } from "../core/discard"
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
  install(period: number): void
  remove(): void
  check(
    filterTabsFrom?: ReadonlyArray<{ id?: number }>,
    ops?: Partial<CheckPrefs>,
    reason?: string
  ): Promise<void>
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
  install(period) {
    // clamp the check interval to between 1 and 20 minutes
    period = Math.min(20 * 60, Math.max(60, period / 3))
    void chrome.alarms.create("number.check", {
      when: Date.now() + period * 1000,
      periodInMinutes: period / 60,
    })
  },
  remove() {
    void chrome.alarms.clear("number.check")
  },
  async check(filterTabsFrom, ops = {}, reason) {
    log("number.check is called", reason)

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
        return
      }
    }
    // only check if INTERNET is connected
    if (prefs.online && navigator.onLine === false) {
      log("discarding is skipped", "No INTERNET connection detected")
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
            exceptionCount += 1
            return false
          }
          if (m(prefs.whitelist) || m(prefs["whitelist.session"])) {
            icon(tb, "tab is in the session or permanent whitelist")
            log("number.check", "tab is ignored", "whitelist", tb.url)
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
        const results =
          tb.status === "unloaded"
            ? []
            : await chrome.scripting
                .executeScript({
                  target: { tabId: tb.id, allFrames: true },
                  // collector ships with the content layer (story #256)
                  files: ["/data/inject/meta.js"],
                })
                .then(
                  (r) => r,
                  () => []
                )
        const ms: Array<TabMeta> = results.map((o) => readMeta(o.result))

        // remove protected tabs (e.g. addons.mozilla.org)
        if (ms.length === 0) {
          if (
            ops["ignore.meta.data"] === true &&
            tb.url?.startsWith("http") !== true
          ) {
            log("discarding aborted", "metadata fetch error", tb.url)
            icon(tb, "metadata fetch error")
            exceptionCount += 1
            continue
          }
        }
        const meta: TabMeta = Object.assign({}, ...ms)
        meta.forms = ms.some((o) => o.forms === true)
        meta.audible = ms.some((o) => o.audible === true)
        meta.paused = ms.some((o) => o.paused === true)

        // using too much memory => discard instantly
        if (
          prefs["memory-enabled"] &&
          meta.memory &&
          meta.memory > prefs["memory-value"] * 1024 * 1024
        ) {
          log("forced discarding", "memory usage")
          void discard(tb)
          continue
        }
        if (meta.ready !== true && ops["ignore.ready.state"] !== true) {
          log("discarding aborted", "tab is not ready", tb)
          exceptionCount += 1
          continue
        }
        if (prefs.audio && meta.audible) {
          log("discarding aborted", "audio is playing", tb)
          icon(tb, "tab plays an audio")
          exceptionCount += 1
          continue
        }
        if (prefs.paused && meta.paused) {
          log("discarding aborted", "player is paused", tb)
          icon(tb, "tab has a paused player")
          exceptionCount += 1
          continue
        }
        if (prefs.form && meta.forms) {
          log("discarding aborted", "active form", tb)
          icon(tb, "there is an active form on this tab")
          exceptionCount += 1
          continue
        }
        if (prefs["notification.permission"] && meta.permission) {
          log("discarding aborted", "tab has notification permission")
          icon(tb, "tab has notification permission")
          exceptionCount += 1
          continue
        }
        if (tb.autoDiscardable === false) {
          log("discarding aborted", "tab is not discardable", tb)
          exceptionCount += 1
          icon(tb, "tab is not discardable")
          continue
        }
        if (now - (meta.time ?? now) < prefs.period * 1000) {
          log("discarding aborted", "tab is not old", tb)
          exceptionCount += 1
          icon.reset(tb)
          continue
        }
        if (tb.active) {
          log("discarding aborted", "tab is active", tb)
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
    for (const tb of tbds) {
      void discard(tb)
    }
  },
}

/** Registry of custom tab filters contributed by plugins (empty by default). */
const pluginFilters: Record<string, PluginFilter> = {}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "number.check") {
    log("alarm fire", "number.check", alarm.name)
    // make sure alarm is firing next time
    if (alarm.periodInMinutes) {
      void chrome.alarms.create(alarm.name, {
        when: Date.now() + alarm.periodInMinutes * 60 * 1000,
        periodInMinutes: alarm.periodInMinutes,
      })
    }
    void number.check(undefined, undefined, "number/1")
  }
})

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
  const check = (): Promise<void> =>
    storage<{ mode: string; period: number; tmp_disable: number }>({
      mode: "time-based",
      period: 10 * 60,
      tmp_disable: 0,
    }).then((ps) => {
      if (
        ps.period &&
        (ps.mode === "time-based" || ps.mode === "url-based") &&
        ps.tmp_disable === 0
      ) {
        number.install(ps.period)
      } else {
        number.remove()
      }
    })
  starters.push(() => {
    void check()
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
