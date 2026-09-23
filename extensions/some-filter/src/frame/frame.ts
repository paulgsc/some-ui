/**
 * SF-CUT3 (#1489): the enforcement sheet for subframes.
 *
 * CSS never crosses a frame boundary, so every frame needs the sheet in its
 * own document, requested for itself. `background.ts` registers this script
 * dynamically — every frame, `document_start`, alongside `prepaint.css` —
 * only while `enforcementSheetEnabled` is on, so the default path puts
 * nothing into any iframe. The registration also matches the top frame, where
 * `content.ts` already owns everything; this script exits there at once.
 *
 * A subframe gets the same handshake as the top frame, without the
 * classifier (the flag being on means the sheet is auto mode) and without
 * the top frame's custody registry and watchdogs: raise this frame's veil,
 * ask the background for the tab's state, and in auto request the sheet,
 * confirm it by reading the cascade, then release the veil. Legacy needs
 * nothing here — legacy's filter on the top document's `<html>` composites
 * every frame inside it — and neither does off.
 *
 * The tab-state messages the top frame reacts to (`CYCLE_TAB_STATE`,
 * `TOGGLE_FILTER`) are sent with `tabs.sendMessage` and no `frameId`, so they
 * reach every frame; this frame follows them the same way, removing its own
 * sheet under its own veil before the tab leaves auto.
 */

import { DEFAULT_SWATCH_ID, SWATCHES } from "@filter/adapter/swatches"
import { createDocumentEnforcementDeps } from "@filter/lib/content/enforcement-dom"
import { createEnforcementQueue } from "@filter/lib/content/enforcement-handshake"
import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import { disablePrepaint, enablePrepaint } from "@filter/lib/content/prepaint"
import { DEFAULT_TAB_STATE, nextTabState } from "@filter/lib/tab-state"
import { ext } from "@filter/platform/content"
import type { TabState } from "@filter/types/tab"

const ENFORCEMENT_FLAG_KEY = "enforcementSheetEnabled"
const BG0 = SWATCHES[DEFAULT_SWATCH_ID].bg0

function isSubframe(): boolean {
  try {
    return window.top !== window
  } catch {
    // A cross-origin top that refuses the comparison is still a top that is
    // not this window.
    return true
  }
}

const deps = createDocumentEnforcementDeps((request) =>
  ext.runtime.sendMessage(request)
)

let state: TabState = DEFAULT_TAB_STATE
let generation = 0
let mayBePresent = false
/** Ensures and removals for this frame's document, strictly in call order. */
const queue = createEnforcementQueue(deps, DEFAULT_SWATCH_ID, BG0)

async function enforce(current: number): Promise<void> {
  mayBePresent = true
  await queue.ensure(() => current === generation)
  // Confirmed or timed out, the veil comes down: onto the enforced page, or
  // onto the native one — never a permanently blacked-out frame.
  if (current === generation) disablePrepaint()
}

async function leave(current: number): Promise<void> {
  const removed = await queue.remove()
  if (current !== generation) return
  if (removed) mayBePresent = false
  disablePrepaint()
}

function apply(next: TabState): void {
  state = next
  generation++
  if (next === "auto") {
    enablePrepaint()
    void enforce(generation)
  } else if (mayBePresent) {
    enablePrepaint()
    void leave(generation)
  } else {
    disablePrepaint()
  }
}

async function start(): Promise<void> {
  let flag = false
  try {
    const data = await ext.storage.local.get([ENFORCEMENT_FLAG_KEY])
    flag = data[ENFORCEMENT_FLAG_KEY] === true
  } catch {
    // Unreadable is off.
  }
  if (!flag) {
    // The registration outlived the flag (it is unregistered on the next
    // storage change). Nothing to enforce.
    disablePrepaint()
    return
  }

  let initial: TabState = DEFAULT_TAB_STATE
  try {
    const response = await ext.runtime.sendMessage({
      type: "GET_TAB_FILTER_STATE",
    })
    if (isGetTabFilterStateResponse(response)) {
      initial = response.enabled
        ? "legacy"
        : (response.tabState ?? DEFAULT_TAB_STATE)
    }
  } catch {
    // Background unavailable: auto is the default, and the handshake's own
    // liveness bound releases the veil if the background stays away.
  }

  ext.runtime.onMessage.addListener((msg: unknown): void => {
    if (!isExtensionMessage(msg)) return
    if (msg.type === "CYCLE_TAB_STATE") apply(nextTabState(state))
    else if (msg.type === "TOGGLE_FILTER")
      apply(msg.enabled ? "legacy" : "auto")
  })
  apply(initial)
}

if (isSubframe()) {
  // document_start: raise this frame's veil before its first paint.
  enablePrepaint()
  void start()
}

export {}
