/**
 * Proof, via the real --load-extension pipeline, that the coverage watchdog
 * catches a real gap: a vendor flush carrying off `#__sw_legacy_filter`
 * while `data-sw-legacy` stays on `<html>` ("declared legacy, filter gone").
 *
 * It proves the *instrument* — the decoupling is visible in the persisted
 * diagnostics bundle debug.html reads — not the flash
 * (yt-navigate-repaint.spec.ts covers that fix).
 *
 * Reads go through the background service worker: `chrome.storage` is
 * unreachable from page JS, even with a content script attached.
 *
 * Classification (#1360): internal-state claim, fine as-is.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
} from "@filter/playwright/fixtures/legacy-mode"
import type { Page, Worker } from "@playwright/test"

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

/** Matches coverage-observability.ts's INDEX_KEY — the debug page's own session picker reads through this, separately from (and racing independently against) the per-session bundle key readBundle() reads. */
async function readIndexSessionIds(sw: Worker): Promise<Array<string>> {
  const raw: unknown = await sw.evaluate(() => {
    // eslint-disable-next-line no-restricted-globals
    return chrome.storage.local
      .get("sf.observability.index.v1")
      .then(
        (store: Record<string, unknown>) => store["sf.observability.index.v1"]
      )
  })
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (e): e is { sessionId: string } =>
        e !== null &&
        typeof e === "object" &&
        typeof Reflect.get(e, "sessionId") === "string"
    )
    .map((e) => e.sessionId)
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

    // Assert against the delta, so this need not be the counter's first use.
    const before = await readBundle(sw, sessionId)
    const violationsBefore =
      before?.metrics.counters["legacy_signal_mismatches"] ?? 0

    // Carry off only the <style> that makes data-sw-legacy real, as a
    // vendor flush touching part of the document would.
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

    // Recovery: re-apply legacy and confirm the watchdog records the repair
    // too, not just the break.
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

    // debug.html is a normal extension page; the extension id comes from the
    // worker's URL.
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

test.describe("debug.html — contrast health for a session that never entered auto", () => {
  test("reports degraded/unevaluated, not a false-clean 100/healthy — scoreHealth excludes 'unknown' results, so an all-unknown ContrastHeld result (nothing ever audited) must not read as 100/healthy", async ({
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

    // The session index and the per-session bundle are separately debounced
    // writes; wait for both, or debug.html shows "Nothing to show yet.".
    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")
    await pollUntil(
      () => readIndexSessionIds(sw),
      (ids) => ids.includes(sessionId)
    )
    await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => b !== undefined
    )

    const extensionId = new URL(sw.url()).host
    const debugPage = await context.newPage()
    await debugPage.goto(`chrome-extension://${extensionId}/debug.html`)

    // Health sections are appended after async computeHealth() calls; the
    // synchronous "Session" section exists earlier, so wait for health.
    await debugPage.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("h2")).some(
          (h) => h.textContent === "Contrast health"
        ),
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const sections = await debugPage.evaluate(() =>
      Array.from(document.querySelectorAll("section")).map((s) => ({
        heading: s.querySelector("h2")?.textContent ?? null,
        scoreText: s.querySelector(".sf-score")?.textContent ?? null,
      }))
    )
    const contrastSection = sections.find(
      (s) => s.heading === "Contrast health"
    )
    expect(
      contrastSection,
      `expected a "Contrast health" section among: ${JSON.stringify(sections)}`
    ).toBeDefined()
    expect(contrastSection?.scoreText).not.toBeNull()
    expect(contrastSection?.scoreText).not.toContain("healthy")

    await debugPage.close()
  })
})

// ── The transitioning window ─────────────────────────────────────────────────

/** tab-state.ts's STATE_CYCLE, driven through the real message path — mirrors issue-1341-sfrc2-foreground-repair.spec.ts's own "auto -> off" usage. */
async function cycleTabState(sw: Worker, tabId: number): Promise<void> {
  await sw.evaluate(async (id) => {
    // eslint-disable-next-line no-restricted-globals
    await chrome.tabs.sendMessage(id, { type: "CYCLE_TAB_STATE" })
  }, tabId)
}

async function findTabId(sw: Worker, urlSubstring: string): Promise<number> {
  return sw.evaluate(async (needle) => {
    // eslint-disable-next-line no-restricted-globals
    const tabs = await chrome.tabs.query({})
    const t = tabs.find((tab) => tab.url?.includes(needle))
    if (t?.id === undefined) throw new Error(`no tab matching "${needle}"`)
    return t.id
  }, urlSubstring)
}

test.describe("coverage watchdog — the off->legacy transitioning window", () => {
  test("no coverage.violated event is recorded across a real off->legacy transition — `transitioning` must be set before coverageWatchdog.observe()", async ({
    context,
    fixture,
  }) => {
    const page: Page = await fixture.goto("hostile-page")
    await waitForClassification(page)

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")

    const sw = await backgroundWorker(context)
    const tabId = await findTabId(sw, "hostile-page.html")

    // auto -> off first: the transitioning race exists only on the first
    // observe() after "off" (auto<->legacy never tears the watchdog down).
    await cycleTabState(sw, tabId)
    await page.waitForFunction(
      () => document.body.dataset["swTabState"] === "off",
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const beforeCycle = await readBundle(sw, sessionId)
    const checksBefore = beforeCycle?.metrics.counters["coverage_checks"] ?? 0

    // off -> legacy: the transition under test.
    await cycleTabState(sw, tabId)
    await page.waitForFunction(
      () =>
        document.documentElement.hasAttribute("data-sw-legacy") &&
        document.getElementById("__sw_legacy_filter") !== null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    // Poll until both checks ("observe-start" and "apply-state:legacy")
    // land; the second is what a broken `transitioning` flag corrupts.
    const settled = await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => (b?.metrics.counters["coverage_checks"] ?? 0) >= checksBefore + 2
    )
    if (settled === undefined) throw new Error("unreachable")

    // CoverageHeld reports {ok: "unknown"} in the pre-actuation window,
    // never {ok: false}, so no coverage.violated (or heldForMs:0 recovered)
    // is recorded, and legacy genuinely holds coverage.
    expect(
      settled.events.filter((e) => e.kind === "coverage.violated"),
      `expected zero coverage.violated events across an off->legacy transition, got: ${JSON.stringify(settled.events)}`
    ).toHaveLength(0)
    expect(
      settled.events.filter((e) => e.kind === "coverage.recovered")
    ).toHaveLength(0)
  })
})
