// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/data/inject/meta.js (MPL-2.0)
// Copyright (C) auto-tab-discard contributors
//
// Per-frame metadata collector. The worker injects this via
// `chrome.scripting.executeScript({ func: collectMeta, ... })` rather than as a
// bundled file: a bundler (Rollup) tree-shakes the side-effect-free payload of a
// classic completion-value script, which silently broke metadata collection and
// disabled auto-discard. Passing the function directly is serialized verbatim
// (`Function.prototype.toString`) and is immune to that.
//
// IMPORTANT: this function is serialized and executed in the page's content
// sandbox. It must be fully self-contained — only page/runtime globals
// (`document`, `window`, `Notification`, `Array`), no module-scope references.
// `window.lastVisit` / `window.isReceivingFormInput` are set by watch.ts in the
// same isolated world and declared globally there.

/** Metadata the worker reads from a tab before deciding to suspend it. */
export type CollectedMeta = {
  ready: boolean
  /** Undefined when watch.ts was not injected (pre-existing tab). The worker
   *  falls back to tab.lastAccessed in that case. */
  time: number | undefined
  forms: boolean
  audible: boolean
  paused: boolean
  permission: boolean
}

/** Collect suspend-relevant metadata for the frame it runs in. */
export function collectMeta(): CollectedMeta {
  const media = Array.from(
    document.querySelectorAll<HTMLMediaElement>("audio, video")
  )
  return {
    ready: true,
    // undefined when watch.ts has not yet injected window.lastVisit (e.g. tabs
    // that were open before the extension was installed).  The worker falls back
    // to tab.lastAccessed so these tabs are not permanently stuck as "too young".
    time: typeof window.lastVisit === "number" ? window.lastVisit : undefined,
    forms: window.isReceivingFormInput === true,
    audible: media.some((m) => !m.paused && !m.muted && m.volume > 0),
    paused: media.some((m) => m.paused),
    permission: Notification.permission === "granted",
  }
}
