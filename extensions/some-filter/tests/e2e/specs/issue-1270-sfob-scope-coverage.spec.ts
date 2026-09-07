/**
 * SF-OB (#1270) — proof, via the real --load-extension pipeline, that
 * scope-quantified coverage observability (`coverage-watchdog.ts`'s
 * `createScopeCoverageWatchdog`) actually catches a real per-scope coverage
 * gap, not just a synthetic unit-test context. Mirrors
 * `coverage-watchdog.spec.ts`'s own structure exactly — that spec proves the
 * document-level "declared legacy, but the filter rule is gone" desync is
 * visible in the diagnostics bundle; this one proves the scope-level
 * analogue: a COMMITTED shadow scope whose `data-sw-patched` realization was
 * removed out from under the registry, with no registry transition of its
 * own to signal it (shadow-scope-discovery.ts's own `isThemeTaggingMutation`
 * deliberately treats that removal as self-authored, not vendor evidence —
 * see that function's doc comment — so nothing else in this codebase ever
 * notices).
 *
 * Every poll below targets *this specific shadow scope's own id*, never a
 * bare "any violation happened" counter check: the document scope (r_0) has
 * its own harmless bootstrap-timing violation/recovery blip on every page
 * load (its veil settles a few milliseconds after the watchdog's first,
 * synchronous `observe-start` check) — a generic "violations > 0" poll is
 * satisfied by that alone, racing ahead of this test's own tag-removal
 * before it ever takes effect. Scoping every assertion to the shadow scope's
 * id is what makes this deterministic instead of timing-dependent.
 *
 * Reads go through the background service worker, not `page.evaluate()`:
 * `chrome.storage` is an extension-context API, unreachable from a page's
 * own main-world JS.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import { backgroundWorker } from "@filter/playwright/fixtures/legacy-mode"
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
    detail?: { id?: string }
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

async function removeSurfaceTag(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.getElementById("shadow-trace-host")
    const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
    surface?.removeAttribute("data-sw-patched")
  })
}

async function restoreSurfaceTag(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = document.getElementById("shadow-trace-host")
    const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
    surface?.setAttribute("data-sw-patched", "shadow-trace-surface")
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
  test("removing a COMMITTED shadow scope's own data-sw-patched tag out from under the registry is recorded as a scope coverage violation", async ({
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

    // The desync: the registry still believes this shadow scope is
    // COMMITTED, but its own realization's tag is gone — no registry
    // transition happens (isThemeTaggingMutation treats this as
    // self-authored, not vendor evidence), so only the periodic
    // scope-coverage poll can ever notice.
    await removeSurfaceTag(page)

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

    // Recovery: restore the tag and confirm the watchdog notices the repair
    // too, not just the break — same discipline coverage-watchdog.spec.ts's
    // own legacy-signal test applies.
    await restoreSurfaceTag(page)
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
  test("the Live scopes section lists the committed shadow scope, and flags it once its tag is removed", async ({
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

    await removeSurfaceTag(page)
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
