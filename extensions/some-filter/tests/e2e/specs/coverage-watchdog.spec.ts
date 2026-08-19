/**
 * Proof, via the real --load-extension pipeline, that the coverage watchdog
 * (`src/lib/content/coverage-watchdog.ts`) actually catches a real coverage
 * gap rather than just a synthetic unit-test context — the class of gap a
 * vendor document flush can open by carrying off `#__sw_legacy_filter`
 * while leaving `data-sw-legacy` on `<html>` behind (the "declared legacy,
 * but the filter rule that makes it real is gone" scenario
 * coverage-observability.ts's header traces the reported live flash to).
 *
 * This does not reproduce the flash itself (yt-navigate-repaint.spec.ts
 * covers the fix for that) — it proves the *instrument*: that decoupling the
 * two legacy signals is visible afterward in the persisted diagnostics
 * bundle a human would read on debug.html, with no live DOM access needed.
 *
 * Reads go through the background service worker, not `page.evaluate()`:
 * `chrome.storage` is an extension-context API, unreachable from a page's
 * own main-world JS (which is what `page.evaluate()` runs in) even on a page
 * a content script is attached to.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
} from "@filter/playwright/fixtures/legacy-mode"
import type { Worker } from "@playwright/test"

/** Matches coverage-observability.ts's sessionStorageKey() — the storage-side contract this test reads through, same as any other diagnostics consumer (the debug page included) would. */
function sessionStorageKey(sessionId: string): string {
  return `sf.observability.session.${sessionId}.v1`
}

type MinimalBundle = {
  events: ReadonlyArray<{ kind: string; severity: string }>
  metrics: { counters: Record<string, number> }
}

function isMinimalBundle(value: unknown): value is MinimalBundle {
  if (value === null || typeof value !== "object") return false
  const events = Reflect.get(value, "events")
  const metrics = Reflect.get(value, "metrics")
  return (
    Array.isArray(events) &&
    metrics !== null &&
    typeof metrics === "object" &&
    typeof Reflect.get(metrics, "counters") === "object"
  )
}

async function readBundle(
  sw: Worker,
  sessionId: string
): Promise<MinimalBundle | undefined> {
  const raw: unknown = await sw.evaluate((key) => {
    // eslint-disable-next-line no-restricted-globals
    return chrome.storage.local
      .get(key)
      .then((store: Record<string, unknown>) => store[key])
  }, sessionStorageKey(sessionId))
  return isMinimalBundle(raw) ? raw : undefined
}

async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 5_000,
  intervalMs = 100
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T
  do {
    last = await read()
    if (predicate(last)) return last
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  } while (Date.now() < deadline)
  throw new Error(
    `pollUntil timed out after ${timeoutMs}ms; last value: ${JSON.stringify(last)}`
  )
}

test.describe("coverage watchdog observes a real legacy-signal decoupling", () => {
  test("removing #__sw_legacy_filter while data-sw-legacy stays behind is recorded as a coverage violation", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "hostile-page.html")

    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    expect(
      sessionId,
      "content.ts should have published its session id"
    ).toBeTruthy()
    if (sessionId === undefined) throw new Error("unreachable")

    // Precondition: read whatever the counter already is (0 on a fresh
    // session, but the assertion below is against the delta regardless) so
    // this test does not depend on being the very first thing to touch it.
    const before = await readBundle(sw, sessionId)
    const violationsBefore =
      before?.metrics.counters["legacy_signal_mismatches"] ?? 0

    // The decoupling: carry off only the <style> tag that makes the
    // data-sw-legacy attribute's declaration real, leaving the attribute
    // itself untouched — exactly what a vendor flush touching only part of
    // <head> would do.
    await page.evaluate(() => {
      document.getElementById("__sw_legacy_filter")?.remove()
    })

    const settled = await pollUntil(
      () => readBundle(sw, sessionId),
      (b) =>
        (b?.metrics.counters["legacy_signal_mismatches"] ?? 0) >
        violationsBefore
    )
    if (settled === undefined) throw new Error("unreachable")
    const after = settled

    expect(
      after.metrics.counters["legacy_signal_mismatches"] ?? 0
    ).toBeGreaterThan(violationsBefore)
    expect(after.metrics.counters["coverage_violations"] ?? 0).toBeGreaterThan(
      0
    )

    const mismatchEvent = after.events.find(
      (e) => e.kind === "legacy.signal_mismatch"
    )
    expect(mismatchEvent).toBeDefined()
    expect(mismatchEvent?.severity).toBe("error")

    const coverageEvent = after.events.find(
      (e) => e.kind === "coverage.violated"
    )
    expect(coverageEvent).toBeDefined()

    // Recovery: re-apply legacy (the fix under test in
    // yt-navigate-repaint.spec.ts) and confirm the watchdog notices the
    // repair too, not just the break.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })
    await waitForClassification(page)

    await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => b?.events.some((e) => e.kind === "legacy.signal_resolved") ?? false
    )
  })
})

test.describe("debug.html renders the session a violation was recorded against", () => {
  test("the picker lists the tab, and the health section shows the violated check", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "hostile-page.html")

    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    await page.evaluate(() => {
      document.getElementById("__sw_legacy_filter")?.remove()
    })

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")
    await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => (b?.metrics.counters["legacy_signal_mismatches"] ?? 0) > 0
    )

    // debug.html is a normal extension page (not privileged CDP access like
    // the service worker) — the extension id comes from the worker's own
    // URL, the only handle this test already has into the loaded extension.
    const extensionId = new URL(sw.url()).host
    const debugPage = await context.newPage()
    await debugPage.goto(`chrome-extension://${extensionId}/debug.html`)

    await debugPage.waitForFunction(
      () => document.querySelectorAll("section").length > 0,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const picked = await debugPage.evaluate(() => {
      const select = document.querySelector("select")
      return select?.selectedOptions[0]?.textContent ?? null
    })
    expect(picked).toContain("Hostile Page Fixture")
    expect(picked).toContain("[legacy]")

    const checks = await debugPage.evaluate(() =>
      Array.from(document.querySelectorAll("ul.sf-checks li")).map(
        (li) => li.textContent
      )
    )
    const legacyCheck = checks.find((text) =>
      text.includes("LegacySignalsAgree")
    )
    expect(
      legacyCheck,
      `expected a LegacySignalsAgree row among: ${JSON.stringify(checks)}`
    ).toBeDefined()
    expect(legacyCheck).toContain("✕")

    await debugPage.close()
  })
})
