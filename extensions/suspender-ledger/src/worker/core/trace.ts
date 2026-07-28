// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * `trace()` — the low-ceremony recording call, kept at its original signature
 * so the ~30 existing call sites did not have to be rewritten in the same diff
 * that introduced observability.
 *
 * What changed is where the output goes. This used to be an always-on
 * `console.log` firehose, explicitly marked temporary, whose entire value
 * evaporated the moment the console was closed or the event page was recycled
 * — which is exactly when the intermittent bug it was chasing occurred. It now
 * writes into the flight recorder (`observability.ts`): bounded, persisted
 * across worker generations, and readable after the fact on `debug.html`.
 * Console output survives too, but gated on the user's `log` preference.
 *
 * Call sites that carry real diagnostic weight should graduate to a named
 * {@link SuspenderEventKind} with a counter behind it. `trace` is for the
 * long tail — the breadcrumbs that only matter once you are already reading a
 * timeline.
 */

import type { JsonValue } from "@some-extension/common/observability"

import { record } from "./observability"

export function trace(
  scope: string,
  tabId: number | undefined,
  ...args: Array<unknown>
): void {
  const detail: Record<string, JsonValue> = { scope }
  if (args.length > 0) {
    detail.args = args.map((a) => toJson(a))
  }
  record("trace", tabId, detail)
}

/**
 * Coerce an arbitrary logged value into something persistable. Errors keep
 * their message (the part worth reading), unknown object graphs are passed
 * through `JSON.stringify`'s own view of them, and anything cyclic or exotic
 * degrades to a label rather than throwing inside the logging path.
 */
export function toJson(value: unknown): JsonValue {
  if (value === null) {
    return null
  }
  if (value === undefined) {
    return "(undefined)"
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return value.toString()
  }
  if (typeof value === "function") {
    return "(function)"
  }
  if (value instanceof Error) {
    return { error: value.name, message: value.message }
  }
  return walk(value, new WeakSet(), 0)
}

/** Deeper than this and a logged object is noise, not diagnosis. */
const MAX_DEPTH = 4

/**
 * Convert an object graph into `JsonValue` explicitly, rather than via a
 * `JSON.parse(JSON.stringify(…))` round trip.
 *
 * The round trip is shorter, but it returns `any` and it *throws* on a cycle —
 * and the values `trace` is handed (`chrome.tabs.Tab`, `changeInfo` bags, FSM
 * states) are exactly the kind of host objects that can be cyclic. A logging
 * path that can throw is worse than useless: it turns a diagnostic into a new
 * fault. Cycles and over-deep branches degrade to a label instead.
 */
function walk(value: object, seen: WeakSet<object>, depth: number): JsonValue {
  if (seen.has(value)) {
    return "(circular)"
  }
  if (depth >= MAX_DEPTH) {
    return "(depth limit)"
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item: unknown) => step(item, seen, depth))
  }

  const out: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = step(item, seen, depth)
  }
  return out
}

function step(item: unknown, seen: WeakSet<object>, depth: number): JsonValue {
  if (item !== null && typeof item === "object") {
    return item instanceof Error
      ? { error: item.name, message: item.message }
      : walk(item, seen, depth + 1)
  }
  return toJson(item)
}
