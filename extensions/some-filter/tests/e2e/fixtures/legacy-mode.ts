/**
 * e2e helper for putting a fixture tab into legacy mode via the real
 * extension code path (storage + a TOGGLE_FILTER message to the tab), the
 * same route background.ts's popup-driven `applyLegacyStyle`/tab-lifecycle
 * handlers use — not a content.ts-internal shortcut. Shared by
 * `yt-navigate-repaint.spec.ts` and `coverage-watchdog.spec.ts`.
 */

import type { Worker } from "@playwright/test"

export const LEGACY_CONFIG = {
  invert: 1,
  hueRotate: 180,
  sepia: 0.12,
  brightness: 0.5,
  contrast: 0.92,
}

/** Chromium's MV3 background service worker. */
export async function backgroundWorker(context: {
  serviceWorkers(): ReadonlyArray<Worker>
  waitForEvent(event: "serviceworker"): Promise<Worker>
}): Promise<Worker> {
  const [existing] = context.serviceWorkers()
  return existing ?? context.waitForEvent("serviceworker")
}

/** Puts the tab whose URL contains `urlSubstring` into legacy mode. */
export async function enterLegacyMode(
  sw: Worker,
  urlSubstring: string,
  config: typeof LEGACY_CONFIG = LEGACY_CONFIG
): Promise<void> {
  // This runs inside the extension's own MV3 service worker via CDP, not
  // through this repo's module graph — `@filter/platform`'s browser.*
  // wrapper isn't reachable here, and the fixture (tests/e2e/fixture.ts)
  // is Chromium-only by design, so the raw chrome.* API is the correct
  // (only) tool for the job.
  await sw.evaluate(
    async ({ urlSubstring, config }) => {
      // eslint-disable-next-line no-restricted-globals
      const tabs = await chrome.tabs.query({})
      const target = tabs.find((t) => t.url?.includes(urlSubstring))
      if (target?.id === undefined) {
        throw new Error(`no open tab matching "${urlSubstring}"`)
      }
      // eslint-disable-next-line no-restricted-globals
      await chrome.storage.local.set({
        filteredTabIds: [target.id],
        tabStates: { [target.id]: "legacy" },
        filterConfig: config,
      })
      // eslint-disable-next-line no-restricted-globals
      await chrome.tabs.sendMessage(target.id, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config,
      })
    },
    { urlSubstring, config }
  )
}
