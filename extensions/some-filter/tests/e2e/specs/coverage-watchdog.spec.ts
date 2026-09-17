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
 *
 * SF4 (#1360) classification: internal-state claim, fine as-is. Every
 * assertion here reads the diagnostics instrument's own bookkeeping (the
 * persisted events/counters bundle, debug.html's rendered table) — a
 * legitimate, in-scope claim about whether the *watchdog* correctly detects
 * and records a desync, independent of what the page looks like. This file's
 * own header already says as much: it proves the instrument, not the flash
 * (`yt-navigate-repaint.spec.ts` covers that). Not a candidate for
 * pixel-sampling promotion.
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

test.describe("debug.html — SF-RC5 (#1344): contrast health for a session that never entered auto", () => {
  test("reports degraded/unevaluated, not a false-clean 100/healthy — bot-found (Codex review round 3 on #1443): scoreHealth excludes 'unknown' results from its own score, so an all-unknown ContrastHeld result (nothing ever audited) previously read as 100/healthy", async ({
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

    // The debug page's own session picker (readIndex()) and its per-session
    // bundle (readBundle()) are two separately-debounced storage.local
    // writes that race independently — wait for both, or debug.html can
    // load before either lands and show "Nothing to show yet." instead of
    // the health sections this test actually needs to inspect.
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

    // render()'s health sections are appended only after its own async
    // computeHealth()/computeContrastHealth() calls resolve — the
    // "Session" section (pickerSection(), synchronous) exists well before
    // that, so a bare "any section exists" wait is racy against it.
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

// ── SF-RC5 (#1344) ───────────────────────────────────────────────────────────

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

test.describe("coverage watchdog — SF-RC5 (#1344): the off->legacy transitioning window", () => {
  test("no coverage.violated event is recorded across a real off->legacy transition — the exact false pair the story's own live-proof comment traced to this window (bot-found, Codex review round 1 on #1443: the fix was initially a no-op because content.ts set `transitioning` after, not before, coverageWatchdog.observe())", async ({
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

    // auto -> off. Reaching "off" first matters (issue #1344's own live-proof
    // comment): the transitioning race only exists on the *first* observe()
    // call after "off" — an auto<->legacy switch never tears the watchdog
    // down in between, so observe() there is already a no-op.
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

    // Poll until both checks this transition performs (the watchdog's own
    // "observe-start", and applyState's explicit post-actuation
    // "apply-state:legacy") have actually landed — not just a fixed sleep,
    // since the second is what a broken `transitioning` flag would corrupt.
    const settled = await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => (b?.metrics.counters["coverage_checks"] ?? 0) >= checksBefore + 2
    )
    if (settled === undefined) throw new Error("unreachable")

    // The regression this test locks: with the flag wired correctly,
    // CoverageHeld reports {ok: "unknown"} during the pre-actuation window,
    // never {ok: false} — so no coverage.violated (and consequently no
    // coverage.recovered heldForMs:0 pair) is ever recorded for this
    // transition, on top of legacy actually, genuinely holding coverage.
    expect(
      settled.events.filter((e) => e.kind === "coverage.violated"),
      `expected zero coverage.violated events across an off->legacy transition, got: ${JSON.stringify(settled.events)}`
    ).toHaveLength(0)
    expect(
      settled.events.filter((e) => e.kind === "coverage.recovered")
    ).toHaveLength(0)
  })
})
