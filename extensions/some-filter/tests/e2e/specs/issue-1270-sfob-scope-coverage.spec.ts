/**
 * Proof, via the real --load-extension pipeline, that scope-quantified
 * coverage observability catches a real per-scope gap. The scope-level
 * analogue of `coverage-watchdog.spec.ts`: a COMMITTED shadow scope whose
 * adopted stylesheets a vendor component reassigns wholesale — a plain CSSOM
 * write that produces no `MutationRecord` and no registry transition.
 *
 * The desync removes the scope's host-token rule, which is what
 * `scopeArtifactPresent()` checks (a COMMITTED scope can legitimately have
 * no `data-sw-patched` element).
 *
 * Every poll targets *this shadow scope's id*: the document scope has a
 * harmless bootstrap-timing violation/recovery blip on every load, which a
 * generic "violations > 0" poll would race on.
 *
 * Reads go through the background service worker: `chrome.storage` is
 * unreachable from page JS.
 *
 * Classification (#1360): internal-state claim, as `coverage-watchdog.spec.ts`
 * — it proves the instrument via its persisted diagnostics.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
} from "@filter/playwright/fixtures/legacy-mode"
import { traceDisconnectedThenInsert } from "@filter/playwright/fixtures/shadow-traces"
import type { Page, Worker } from "@playwright/test"

/** Matches coverage-observability.ts's sessionStorageKey(). */
function sessionStorageKey(sessionId: string): string {
  return `sf.observability.session.${sessionId}.v1`
}

type ScopeEntry = {
  id: string
  kind: string
  artifactPresent: boolean | null
}

type MinimalBundle = {
  events: ReadonlyArray<{
    kind: string
    severity: string
    detail?: { id?: string; reason?: string }
  }>
  metrics: { counters: Record<string, number> }
  snapshots: { scopes?: { scopes: ReadonlyArray<ScopeEntry> } }
}

function isMinimalBundle(value: unknown): value is MinimalBundle {
  if (value === null || typeof value !== "object") return false
  const events = Reflect.get(value, "events")
  const metrics = Reflect.get(value, "metrics")
  const snapshots = Reflect.get(value, "snapshots")
  return (
    Array.isArray(events) &&
    metrics !== null &&
    typeof metrics === "object" &&
    typeof Reflect.get(metrics, "counters") === "object" &&
    snapshots !== null &&
    typeof snapshots === "object"
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

/** Waits for shadow-scope-theming.ts's own commit to land on the trace surface — its data-sw-patched tag is the observable signal, set only once the scope reaches COMMITTED. */
async function waitForSurfaceCommitted(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const host = document.getElementById("shadow-trace-host")
      const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
      return surface?.dataset["swPatched"] !== undefined
    },
    undefined,
    { timeout: 5_000, polling: 100 }
  )
}

/**
 * Simulates a vendor component's wholesale
 * `shadowRoot.adoptedStyleSheets = [...]`, carrying our realization off.
 * Stashes the displaced sheets on `window` so `restoreOurSheets()` can bring
 * them back (this spec proves *detection*).
 */
async function simulateVendorSheetReassignment(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.getElementById("shadow-trace-host")
    const shadow = host?.shadowRoot
    if (shadow === null || shadow === undefined) {
      throw new Error("shadow-trace-host has no shadow root")
    }
    // A copy, not the live reference: `adoptedStyleSheets` is a
    // `[SameObject]` observable array, so the reassignment below would
    // mutate a saved reference.
    Reflect.set(window, "__sfObDisplacedSheets", [...shadow.adoptedStyleSheets])
    const vendorSheet = new CSSStyleSheet()
    vendorSheet.replaceSync("div { color: blue; }")
    shadow.adoptedStyleSheets = [vendorSheet]
  })
}

async function restoreOurSheets(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.getElementById("shadow-trace-host")
    const shadow = host?.shadowRoot
    if (shadow === null || shadow === undefined) {
      throw new Error("shadow-trace-host has no shadow root")
    }
    const displaced: unknown = Reflect.get(window, "__sfObDisplacedSheets")
    if (!Array.isArray(displaced)) throw new Error("no displaced sheets saved")
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, ...displaced]
  })
}

/** The trace's own shadow scope id (a fresh `shadow:N`) — found by identity (parent is the document scope, kind is COMMITTED), never assumed to be `shadow:1`: this file's own two tests each start a fresh page/session, but nothing prevents a future addition earlier in this suite's discovery order from bumping the counter. */
async function findCommittedShadowScopeId(
  sw: Worker,
  sessionId: string
): Promise<string> {
  const bundle = await pollUntil(
    () => readBundle(sw, sessionId),
    (b) =>
      (b?.snapshots.scopes?.scopes ?? []).some(
        (s) => s.kind === "COMMITTED" && s.id !== "r_0"
      )
  )
  const scope = bundle?.snapshots.scopes?.scopes.find(
    (s) => s.kind === "COMMITTED" && s.id !== "r_0"
  )
  if (scope === undefined) throw new Error("unreachable")
  return scope.id
}

test.describe("SF-OB — scope coverage watchdog observes a real per-scope desync", () => {
  test("a vendor's wholesale adoptedStyleSheets reassignment on a COMMITTED shadow scope is recorded as a scope coverage violation", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)

    await traceDisconnectedThenInsert(page)
    await waitForSurfaceCommitted(page)

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    expect(
      sessionId,
      "content.ts should have published its session id"
    ).toBeTruthy()
    if (sessionId === undefined) throw new Error("unreachable")

    const sw = await backgroundWorker(context)
    const shadowId = await findCommittedShadowScopeId(sw, sessionId)

    // The registry still believes this scope is COMMITTED, so only the
    // periodic scope-coverage poll can notice.
    await simulateVendorSheetReassignment(page)

    const settled = await pollUntil(
      () => readBundle(sw, sessionId),
      (b) =>
        b?.events.some(
          (e) =>
            e.kind === "scope.coverage_violated" && e.detail?.id === shadowId
        ) ?? false
    )
    if (settled === undefined) throw new Error("unreachable")

    const violatedEvent = settled.events.find(
      (e) => e.kind === "scope.coverage_violated" && e.detail?.id === shadowId
    )
    expect(violatedEvent?.severity).toBe("error")
    expect(
      settled.metrics.counters["scope_coverage_violations"] ?? 0
    ).toBeGreaterThan(0)

    const scope = settled.snapshots.scopes?.scopes.find(
      (s) => s.id === shadowId
    )
    expect(scope?.kind).toBe("COMMITTED")
    expect(scope?.artifactPresent).toBe(false)

    // Recovery: restore the sheets and confirm the watchdog records the
    // repair too, not just the break.
    await restoreOurSheets(page)
    await pollUntil(
      () => readBundle(sw, sessionId),
      (b) =>
        b?.events.some(
          (e) =>
            e.kind === "scope.coverage_recovered" && e.detail?.id === shadowId
        ) ?? false
    )
  })
})

test.describe("debug.html renders the per-scope breakdown for a session with a shadow-hosted scope", () => {
  test("the Live scopes section lists the committed shadow scope, and flags it once its realization sheets are reassigned", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)

    await traceDisconnectedThenInsert(page)
    await waitForSurfaceCommitted(page)

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")

    const sw = await backgroundWorker(context)
    const shadowId = await findCommittedShadowScopeId(sw, sessionId)

    await simulateVendorSheetReassignment(page)
    await pollUntil(
      () => readBundle(sw, sessionId),
      (b) =>
        b?.snapshots.scopes?.scopes.find((s) => s.id === shadowId)
          ?.artifactPresent === false
    )

    const extensionId = new URL(sw.url()).host
    const debugPage = await context.newPage()
    await debugPage.goto(`chrome-extension://${extensionId}/debug.html`)

    await debugPage.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("section h2")).some(
          (h2) => h2.textContent === "Live scopes"
        ),
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const picked = await debugPage.evaluate(() => {
      const select = document.querySelector("select")
      return select?.selectedOptions[0]?.textContent ?? null
    })
    expect(picked).toContain("Shadow Surface Creation-Trace Fixture")

    const shadowRow = await debugPage.evaluate((id: string) => {
      const row = Array.from(
        document.querySelectorAll("table.sf-scopes tbody tr")
      ).find((tr) => tr.querySelector("td")?.textContent === id)
      return row
        ? Array.from(row.querySelectorAll("td")).map((td) => td.textContent)
        : undefined
    }, shadowId)

    expect(
      shadowRow,
      `expected a row for ${shadowId} in the rendered table`
    ).toBeDefined()
    expect(shadowRow?.[1]).toBe("COMMITTED")
    expect(shadowRow?.[3]).toBe("✕")

    await debugPage.close()
  })
})

test.describe("SF-OB — the persisted scope snapshot does not go stale after leaving auto mode", () => {
  test("switching a tab from auto to legacy purges the already-retired shadow scope from the very next 'scopes' snapshot, instead of leaving it COMMITTED forever", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)

    await traceDisconnectedThenInsert(page)
    await waitForSurfaceCommitted(page)

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")

    const sw = await backgroundWorker(context)
    const shadowId = await findCommittedShadowScopeId(sw, sessionId)

    // applyState("legacy") via the real TOGGLE_FILTER route retires and
    // purges this scope, then stops the poll; the one check() between them
    // must publish the post-purge state, or the "scopes" snapshot keeps
    // reporting it COMMITTED.
    await enterLegacyMode(sw, "shadow-surface-page.html")

    const afterLeavingAuto = await pollUntil(
      () => readBundle(sw, sessionId),
      (b) => (b?.snapshots.scopes?.scopes ?? []).every((s) => s.id !== shadowId)
    )

    expect(
      afterLeavingAuto?.snapshots.scopes?.scopes.find((s) => s.id === shadowId),
      "the purged shadow scope should be gone from the very next snapshot, not lingering as COMMITTED"
    ).toBeUndefined()
  })
})

test.describe("SF-OB — the mode-exit scope audit only runs when actually leaving auto", () => {
  test("cycling auto -> off -> legacy records no false scope.coverage_violated for the document scope on the second (non-auto-originated) transition", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)

    const sessionId = await page.evaluate(
      () => document.body.dataset["swObservabilitySession"]
    )
    if (sessionId === undefined) throw new Error("unreachable")

    const sw = await backgroundWorker(context)
    const tabId = await sw.evaluate(async () => {
      // eslint-disable-next-line no-restricted-globals
      const tabs = await chrome.tabs.query({})
      const t = tabs.find((tab) => tab.url?.includes("light-page.html"))
      if (t?.id === undefined) throw new Error("no matching tab")
      return t.id
    })

    // auto -> off -> legacy. The first hop (previous "auto") runs the
    // mode-exit check while the registry still matches the DOM. The second
    // (previous "off") must not: the registry's COMMITTED entry is stale by
    // then, and checking would record a false, unrecoverable
    // "scope.coverage_violated".
    for (let i = 0; i < 2; i++) {
      await sw.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-globals
        await chrome.tabs.sendMessage(id, { type: "CYCLE_TAB_STATE" })
      }, tabId)
      await page.waitForTimeout(150)
    }

    const bundle = await readBundle(sw, sessionId)
    const falseViolations = (bundle?.events ?? []).filter(
      (e) =>
        e.kind === "scope.coverage_violated" &&
        e.detail?.reason === "apply-state:teardown"
    )
    expect(
      falseViolations,
      "no scope.coverage_violated event should ever carry apply-state:teardown as its reason when the mode transition that triggered it didn't originate from auto"
    ).toEqual([])
  })
})
