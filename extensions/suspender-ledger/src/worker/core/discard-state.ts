// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Tracks which currently-open tabs the browser has declined to suspend, and
 * turns that into the one signal this extension surfaces to the user: a
 * toolbar badge count plus a deduplicated, plain-language popup banner.
 *
 * Motivation: `chrome.tabs.discard()` can resolve successfully while leaving
 * the tab live — the browser's own discard-eligibility check (unsaved form
 * input, active media, a `beforeunload` handler, DevTools attached, …) vetoes
 * the discard silently, and extensions are given no reason string. Fighting
 * that veto (e.g. navigating the tab to an owned page to force it closed
 * regardless) would mean overriding a protection the browser put there on
 * purpose to avoid losing the user's unsaved work — not this extension's call
 * to make. What is owed instead is an honest "why nothing happened," and it
 * belongs in space this extension owns (the toolbar action), never painted
 * onto the tab strip itself — a custom favicon or a rewritten tab title reads
 * as either clutter or, worse, something a malicious page could imitate.
 *
 * Only two buckets are exposed, deliberately coarser than the FSM's own state
 * names: `"media"` for the one case this extension can attribute with
 * certainty (`tab.audible`, checked before a discard is even attempted), and
 * `"protected"` for every other silent veto the browser reports back as
 * either a no-op success or an outright refusal. Form input is a common
 * cause in practice, but `beforeunload`, DevTools, and outright policy land in
 * the same bucket — the API gives no way to tell them apart, so the label for
 * this bucket deliberately does not name a specific cause it cannot verify.
 */

import { storage } from "./prefs"

export type DiscardSkipReason = "media" | "protected"

export type SkipEntry = { reason: DiscardSkipReason; at: number }

const REASON_LABEL: Record<DiscardSkipReason, string> = {
  // Deliberately generic: this bucket also covers beforeunload, DevTools, and
  // policy refusals, none of which this module can distinguish from a form —
  // naming "unsaved text" specifically would be false in those cases.
  protected: "This page asked not to be interrupted",
  media: "Playing audio or video",
}

// Fixed display order (not insertion order) so the banner's wording does not
// reshuffle between one popup opening and the next.
const REASON_ORDER: ReadonlyArray<DiscardSkipReason> = ["protected", "media"]

/** Session-storage key the persisted map is mirrored under (survives worker restarts, cleared with the browser session — this is live state, not history). */
export const DISCARD_STATE_STORAGE_KEY = "sl.discardState.v1"

/**
 * In-flight belief about which tabs are currently being kept awake, for the
 * lifetime of this worker instance. Mirrored to `storage.session` on every
 * change so a recycled MV3 service worker can restore it (see
 * {@link hydrateDiscardState}), and so the popup — a separate execution
 * context that never shares this module's memory — can read it directly,
 * the same way `popup/index.ts` already reads preferences straight out of
 * `storage.local` rather than round-tripping through the worker.
 */
export const skipped = new Map<number, SkipEntry>()

function badgeText(count: number): string {
  if (count <= 0) {
    return ""
  }
  return count > 99 ? "99+" : String(count)
}

/** The only UI paint this module performs directly: an ambient count on the extension's own toolbar icon, never on the tab strip. */
function updateBadge(): void {
  void chrome.action.setBadgeText({ text: badgeText(skipped.size) })
}

function writeSession(patch: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set(patch, () => resolve())
  })
}

function persist(): void {
  const plain: Record<string, SkipEntry> = {}
  for (const [tabId, entry] of skipped) {
    plain[tabId] = entry
  }
  void writeSession({ [DISCARD_STATE_STORAGE_KEY]: plain })
}

function isSkipEntry(value: unknown): value is SkipEntry {
  if (value === null || typeof value !== "object") {
    return false
  }
  const reason = Reflect.get(value, "reason")
  return (
    (reason === "media" || reason === "protected") &&
    typeof Reflect.get(value, "at") === "number"
  )
}

/**
 * Restore the map after a worker restart. Call once, from a `starters`
 * callback, before anything else reads `skipped` or paints the badge — MV3
 * event pages are recycled constantly (see design-notes.md), and a map that
 * starts empty every generation would make the badge lie on every restart.
 *
 * The `chrome.tabs.onUpdated`/`onRemoved` listeners and the `number.check`
 * alarm handler are all registered unconditionally at module evaluation, so a
 * `markSkipped`/`clearSkipped` call can land before this async `storage.get`
 * resolves — the very alarm that triggers a discard attempt is often what
 * woke this worker in the first place. Restoring is therefore a *merge*, not
 * a replace: a tab already believed about in memory is left alone rather than
 * clobbered with a snapshot that predates it, and the merged result is
 * persisted back so `storage.session` converges on the same belief.
 */
export async function hydrateDiscardState(): Promise<void> {
  const read = await storage<Record<string, unknown>>(
    { [DISCARD_STATE_STORAGE_KEY]: {} },
    "session"
  )
  const raw = read[DISCARD_STATE_STORAGE_KEY]
  if (raw !== null && typeof raw === "object") {
    for (const [key, entry] of Object.entries(raw)) {
      const tabId = Number(key)
      if (Number.isFinite(tabId) && isSkipEntry(entry) && !skipped.has(tabId)) {
        skipped.set(tabId, entry)
      }
    }
  }
  updateBadge()
  persist()
}

/** Record that `tabId` could not be suspended, and why. Safe to call repeatedly for the same tab — each call just refreshes the evidence timestamp. */
export function markSkipped(tabId: number, reason: DiscardSkipReason): void {
  skipped.set(tabId, { reason, at: Date.now() })
  updateBadge()
  persist()
}

/** Clear `tabId`'s entry — it suspended successfully, or the tab closed. No-op if it was not marked. */
export function clearSkipped(tabId: number): void {
  if (!skipped.delete(tabId)) {
    return
  }
  updateBadge()
  persist()
}

/**
 * Pure: turns a raw tabId→entry map into deduplicated, plain-language
 * reasons. No browser API access, so it is equally usable from the worker
 * (over its live `skipped` map) and the popup (over the `storage.session`
 * snapshot it reads directly).
 */
export function summarizeSkipReasons(
  raw: Record<string, unknown>
): Array<string> {
  const present = new Set<DiscardSkipReason>()
  for (const value of Object.values(raw)) {
    if (isSkipEntry(value)) {
      present.add(value.reason)
    }
  }
  return REASON_ORDER.filter((reason) => present.has(reason)).map(
    (reason) => REASON_LABEL[reason]
  )
}

/** The worker's own view of {@link summarizeSkipReasons}, over its live in-memory map. */
export function skipSummary(): Array<string> {
  return summarizeSkipReasons(Object.fromEntries(skipped))
}
