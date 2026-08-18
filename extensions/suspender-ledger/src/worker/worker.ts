// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/worker/core.mjs (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import { isDebugToWorkerMessage } from "@suspender/types/messages"

import { discard } from "./core/discard"
import { hydrateDiscardState } from "./core/discard-state"
import { isMoveCommand, navigate } from "./core/navigate"
import {
  count,
  exportDiagnostics,
  hydrateObservability,
  obs,
  record,
} from "./core/observability"
import { prefs, storage } from "./core/prefs"
import { starters } from "./core/startup"
import { log, query } from "./core/utils"

import "./modes/number"
import "./menu"
// Firefox compatibility shims must be applied after the core modules load.
import "@suspender/lib/platform/firefox"

/**
 * MV3 service-worker entry point. Composes the suspend chain (prefs → discard →
 * navigate → number/menu) and wires the runtime message handlers.
 *
 * Port note: the upstream `close` navigation and the FAQ/feedback installer
 * (which required the `management` permission and a `homepage_url`) are dropped.
 * This worker never closes a tab.
 */

/*
  Remote access:
    request = { method: 'discard', query: {...}, forced: false }
*/
chrome.runtime.onMessageExternal.addListener((request, _sender, response) => {
  if (request.method === "discard") {
    log("onMessageExternal request received", request)
    const queryInfo: chrome.tabs.QueryInfo = request.query
    void query(queryInfo).then((tbs = []) => {
      if (request.forced !== true) {
        tbs = tbs.filter(
          ({ url = "", discarded, active }) =>
            (url.startsWith("http") || url.startsWith("ftp")) &&
            !discarded &&
            !active
        )
      }
      tbs.forEach((t) => {
        void discard(t)
      })
      response(tbs.map((t) => t.id))
    })
    return true
  }
  return undefined
})

chrome.runtime.onMessage.addListener((request, sender, response) => {
  log("onMessage request received", request)
  const { method } = request
  if (isDebugToWorkerMessage(request)) {
    // The diagnostics page asks the live worker rather than reading the last
    // flushed bundle out of storage — see DebugToWorkerMessage.
    if (request.cmd === "clear") {
      void obs.clear().then(() => response({ ok: true }))
      return true
    }
    void exportDiagnostics().then(
      (bundle) => response(bundle),
      (error: unknown) =>
        response({
          error: error instanceof Error ? error.message : String(error),
        })
    )
    return true
  }
  if (method === "discard.on.load") {
    // for links discarded after the initial load
    if (sender.tab) {
      void discard(sender.tab)
    }
  } else if (typeof method === "string" && isMoveCommand(method)) {
    void navigate(method)
  } else if (method === "storage") {
    void Promise.all([
      storage(request.local ?? {}, "local"),
      storage(request.session ?? {}, "session"),
    ]).then(([local, session]) => response({ ...local, ...session }))
    return true
  }
  return undefined
})

// Flight recorder: rehydrate before anything else records, so counters span
// the extension's whole life rather than this worker generation's. The
// `worker.start` count is itself diagnostic — an implausibly high rate is the
// signature of an event page being churned.
starters.push(() => {
  void hydrateObservability().then(() => {
    count("worker_starts")
    record("worker.start", chrome.runtime.getManifest().version, {
      startedAt: Date.now(),
    })
  })
})

// left-click action: show the popup when configured, otherwise fall back to the
// toolbar action handler wired in menu.ts
const setupPopup = (): void => {
  void chrome.action.setPopup({
    popup: prefs.click === "click.popup" ? "popup.html" : "",
  })
}
starters.push(() => setupPopup())
storage.on("click", () => setupPopup())

// idle timeout
starters.push(() => {
  chrome.idle.setDetectionInterval(prefs["idle-timeout"])
})
storage.on("idle-timeout", () => {
  chrome.idle.setDetectionInterval(prefs["idle-timeout"])
})

// badge: neutral colour, count of tabs the browser is currently declining to
// suspend (see discard-state.ts) — restored before anything else touches it,
// since MV3 can recycle this worker mid-session.
starters.push(() => {
  void chrome.action.setBadgeBackgroundColor({ color: "#666" })
})
starters.push(() => {
  void hydrateDiscardState()
})
