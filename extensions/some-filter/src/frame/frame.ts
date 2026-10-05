/**
 * The enforcement sheet for subframes.
 *
 * CSS never crosses a frame boundary, so every frame needs the sheet in its
 * own document. `background.ts` registers this script dynamically (every
 * frame, `document_start`, with `prepaint.css`) only while
 * `enforcementSheetEnabled` is on. It also matches the top frame, where
 * `content.ts` owns everything, and exits there.
 *
 * Same handshake as the top frame, without the classifier, custody registry
 * or watchdogs: raise this frame's veil, ask the tab's state, and in auto
 * request and confirm the sheet, then release the veil. Legacy needs nothing
 * (the top document's filter composites every frame), nor does off.
 *
 * `CYCLE_TAB_STATE`/`TOGGLE_FILTER` are sent with no `frameId`, so they reach
 * every frame; this one follows them, removing its sheet under its own veil
 * before leaving auto.
 */

import { DEFAULT_SWATCH_ID } from "@filter/adapter/swatches"
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
const queue = createEnforcementQueue(deps, DEFAULT_SWATCH_ID)

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
