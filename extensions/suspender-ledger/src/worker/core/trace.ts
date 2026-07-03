// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * TEMPORARY diagnostic instrumentation for the "suspended tab silently
 * reloads in the background" bug (#409 follow-up). Unlike `log()` in
 * `utils.ts`, this is NOT gated on the `log` preference — it always prints,
 * because the whole point is visibility while chasing an intermittent
 * browser-behavior bug. Delete this file and its call sites once the bug is
 * found and fixed.
 *
 * Every line is prefixed with a monotonic sequence number and a
 * high-resolution timestamp so events from the background worker's console
 * and a page's own console (watch.ts / resume-veil.ts log there too) can be
 * interleaved by hand into one timeline.
 */

let seq = 0

export function trace(
  scope: string,
  tabId: number | undefined,
  ...args: Array<unknown>
): void {
  seq += 1
  const t = (
    typeof performance !== "undefined" ? performance.now() : Date.now()
  ).toFixed(1)
  // eslint-disable-next-line no-console -- temporary diagnostic instrumentation, delete with this file
  console.log(`[SL#${seq} ${t}ms] [${scope}] tab=${tabId ?? "?"}`, ...args)
}
