// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/data/inject/watch.js (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

import type { ContentToWorkerMessage } from "@suspender/types/messages"

/**
 * Page-context content script injected into every frame (`document_idle`). It
 * watches for two things the worker must not suspend through:
 *
 *   1. **Unsaved form input** — exposed as `window.isReceivingFormInput`, a live
 *      getter the worker's meta collector reads via `executeScript` before
 *      discarding a tab. Set true while a typed-into INPUT/TEXTAREA/FORM/
 *      contentEditable/PDF element still holds content; cleared on `submit`.
 *   2. **Last foreground time** — `window.lastVisit`, refreshed on every
 *      `visibilitychange`, used by the worker to age tabs.
 *
 * Port notes:
 *   - Upstream read the deprecated, Chrome-only `event.path` to reach into
 *     shadow/custom-element trees. Firefox has no `event.path`; this uses the
 *     standard `event.composedPath()` instead.
 *   - In addition to the upstream `window` contract, each visibility transition
 *     emits a typed `ContentToWorkerMessage` (see `@suspender/types/messages`).
 *     This is purely additive — the property contract above is unchanged.
 *   - This module touches DOM/runtime APIs only; it never imports worker code.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- `interface` is required to merge into the built-in Window type
  interface Window {
    /** True while the page holds unsaved/in-progress form input. */
    isReceivingFormInput: boolean
    /** Epoch milliseconds of the most recent visibility change. */
    lastVisit: number
  }
}

/**
 * Whether a keydown represents a printable alphanumeric character — the modern,
 * non-deprecated equivalent of upstream's `keyCode` 48–90 ('0'–'9', 'A'–'Z')
 * gate. Modifier/navigation keys report multi-character `key` names ("Shift",
 * "ArrowLeft", "Escape") and are excluded.
 */
function isPrintableKey(key: string): boolean {
  return key.length === 1 && /[0-9a-zA-Z]/.test(key)
}

/** Elements that have received input and may hold unsaved content. */
const dirtyElements = new Set<Element>()
/** Latched once any tracked element is edited; reset by `submit`. */
let receivingInput = false

/** The editable text currently held by an element, "" if it holds none. */
function elementValue(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value
  }
  return el.textContent ?? ""
}

/**
 * `window.isReceivingFormInput`: true only while at least one tracked element is
 * still connected and non-empty. Mirrors upstream — an emptied field stops
 * blocking suspension even before submit.
 */
Object.defineProperty(window, "isReceivingFormInput", {
  configurable: true,
  get(): boolean {
    try {
      const stillDirty = [...dirtyElements].some(
        (el) => el.isConnected && elementValue(el) !== ""
      )
      if (!stillDirty) {
        return false
      }
    } catch {
      // defensive: a detached/cross-origin node can throw on access — ignore.
    }
    return receivingInput
  },
})

/** Latch an element if it is one we treat as holding unsaved input. */
function trackIfEditable(node: EventTarget | undefined): void {
  if (!(node instanceof Element)) {
    return
  }
  if (node instanceof HTMLElement && node.isContentEditable) {
    dirtyElements.add(node)
    receivingInput = true
  }
  if (
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA" ||
    node.tagName === "FORM"
  ) {
    dirtyElements.add(node)
    receivingInput = true
  }
  // embedded PDF viewers (<embed>/<object>) report type="application/pdf"
  if (node.getAttribute("type") === "application/pdf") {
    receivingInput = true
  }
}

// Reset input tracking once the form is submitted.
addEventListener("submit", () => {
  receivingInput = false
  dirtyElements.clear()
})

// Capture-phase keydown: a printable key into an editable element marks the
// page as holding unsaved input.
addEventListener(
  "keydown",
  (e: KeyboardEvent) => {
    if (!isPrintableKey(e.key)) {
      return
    }
    trackIfEditable(e.target ?? undefined)
    // custom elements / shadow DOM: inspect the composed path's deepest node.
    const top = e.composedPath()[0]
    if (top !== undefined && top !== e.target) {
      trackIfEditable(top)
    }
  },
  true
)

/** Best-effort, fire-and-forget notification to the worker. */
function notifyWorker(message: ContentToWorkerMessage): void {
  try {
    // sendMessage rejects when no receiver exists or the context was
    // invalidated; neither is fatal for the page, so swallow it.
    void Promise.resolve(chrome.runtime.sendMessage(message)).catch(
      () => undefined
    )
  } catch {
    // runtime gone (extension reloaded) — nothing to do.
  }
}

// Track foreground time and announce the activity transition.
addEventListener("visibilitychange", () => {
  window.lastVisit = Date.now()
  notifyWorker(
    document.hidden
      ? { type: "TAB_IDLE" }
      : { type: "TAB_ACTIVE", timestamp: window.lastVisit }
  )
})

// Seed lastVisit at injection time (document_idle ⇒ the page is freshly loaded).
window.lastVisit = Date.now()

export {}
