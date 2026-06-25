// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Ported from auto-tab-discard v3/data/inject/meta.js (MPL-2.0)
// Copyright (C) auto-tab-discard contributors
//
// Classic-script meta collector: injected into each frame by the worker via
// executeScript({ files: ["/data/inject/meta.js"] }).
// The return value of the last expression is captured by the worker as TabMeta.
// No imports/exports — this file is a global script, not an ES module.
// window.lastVisit and window.isReceivingFormInput are declared globally in
// watch.ts and available here via the shared tsconfig.

const _media = Array.from(
  document.querySelectorAll<HTMLMediaElement>("audio, video")
)

// The object literal is the last expression; executeScript captures its value
// as InjectionResult.result for this frame.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;({
  ready: true,
  time: typeof window.lastVisit === "number" ? window.lastVisit : Date.now(),
  forms: window.isReceivingFormInput === true,
  audible: _media.some((m) => !m.paused && !m.muted && m.volume > 0),
  paused: _media.some((m) => m.paused),
  permission: Notification.permission === "granted",
})
