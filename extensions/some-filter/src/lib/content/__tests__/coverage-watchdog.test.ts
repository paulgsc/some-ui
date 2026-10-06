import { createOcclusionHold } from "@filter/adapter/custody-primitive"
import {
  createScopeRegistry,
  type CommittedRealization,
  type CustodyPrimitive,
  type ScopeRef,
  type ScopeRegistry,
} from "@filter/adapter/scope-registry"
import {
  createCoverageRecorder,
  type CoverageRecorder,
} from "@filter/lib/content/coverage-observability"
import {
  createCoverageWatchdog,
  createScopeCoverageWatchdog,
  MAX_SNAPSHOT_SCOPE_ENTRIES,
  type CoverageWatchdog,
  type ScopeCoverageWatchdog,
} from "@filter/lib/content/coverage-watchdog"
import { PREPAINT_VEIL_ID } from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
  LEGACY_FILTER_STYLE_ID,
  LEGACY_THEME_ATTR,
} from "@filter/lib/content/theme-apply"
import type { TabState } from "@filter/types/tab"
import { afterEach, describe, expect, it, vi } from "vitest"

// The repair runs behind runInvariants()'s async chain, itself behind the
// MutationObserver's microtask delivery; a generous flush avoids pinning an
// exact microtask count.
async function flushMicrotasks(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

function installDarkTheme(): void {
  document.documentElement.setAttribute(DARK_THEME_ATTR, "")
  const style = document.createElement("style")
  style.id = DARK_THEME_STYLE_ID
  style.textContent = "html,body{--sw-bg-0:#171c25;}"
  document.head.appendChild(style)
}

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  document.documentElement.classList.remove("sw-dirty")
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  document.documentElement.removeAttribute(LEGACY_THEME_ATTR)
  document.head.querySelectorAll("style").forEach((el) => el.remove())
  document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
  document.body.innerHTML = ""
})

/** Mirrors theme-apply.ts's applyLegacyFilter(): attribute and stylesheet both anchored on <html>. */
function installLegacyFilter(): void {
  document.documentElement.setAttribute(LEGACY_THEME_ATTR, "")
  const style = document.createElement("style")
  style.id = LEGACY_FILTER_STYLE_ID
  style.setAttribute("data-my-ext", "")
  style.textContent = "html { filter: invert(1) !important; }"
  document.documentElement.appendChild(style)
}

function styleById(id: string): HTMLElement {
  const style = document.getElementById(id)
  if (style === null) throw new Error(`${id} missing`)
  return style
}

const veil = (): HTMLElement | null => document.getElementById(PREPAINT_VEIL_ID)

/** A document watchdog over a fixed (or live) tab state, observing from the start. */
async function startWatchdog(
  tabState: TabState,
  options: {
    transitioning?: () => boolean
    onVeilRearmed?: () => void
  } = {}
): Promise<{
  recorder: CoverageRecorder
  watchdog: CoverageWatchdog
}> {
  const recorder = createCoverageRecorder("test", false)
  const watchdog = createCoverageWatchdog(
    recorder,
    () => tabState,
    options.transitioning ?? ((): boolean => false),
    options.onVeilRearmed
  )
  watchdog.observe()
  await flushMicrotasks()
  return { recorder, watchdog }
}

describe("coverage watchdog — dark-signal desync repair", () => {
  it("re-arms the veil when a <head> replacement carries off #__sw_dark_theme but data-sw-dark survives", async () => {
    installDarkTheme()
    const { watchdog } = await startWatchdog("auto")
    expect(veil()).toBeNull()

    // Only the stylesheet is carried off; data-sw-dark lives on <html>.
    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(veil()).not.toBeNull()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
    watchdog.teardown()
  })

  it("re-arms the veil when the stylesheet is retained but its textContent is wiped in place", async () => {
    // The mutation targets the <style> (a [data-my-ext] descendant of
    // <head>), which only the head observer's subtree + characterData see.
    installDarkTheme()
    const { watchdog } = await startWatchdog("auto")
    expect(veil()).toBeNull()

    styleById(DARK_THEME_STYLE_ID).textContent = ""
    await flushMicrotasks()

    expect(veil()).not.toBeNull()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
    watchdog.teardown()
  })

  it("does not repair while the tab is off", async () => {
    installDarkTheme()
    const { watchdog } = await startWatchdog("off")

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(veil()).toBeNull()
    watchdog.teardown()
  })

  it("does not repair a genuine already-dark verdict — restoreVendor() drops both signals together", async () => {
    installDarkTheme()
    const { watchdog } = await startWatchdog("auto")

    // Mirrors theme-apply.ts's deactivateDarkTheme().
    document.documentElement.removeAttribute(DARK_THEME_ATTR)
    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(veil()).toBeNull()
    watchdog.teardown()
  })

  it("does not repair in legacy mode, where the veil's own color depends on the (possibly stale) legacy attribute", async () => {
    document.documentElement.setAttribute("data-sw-legacy", "")
    const { watchdog } = await startWatchdog("legacy")

    // Even a stray data-sw-dark must not trigger the dark-only repair.
    document.documentElement.setAttribute(DARK_THEME_ATTR, "")
    await flushMicrotasks()

    expect(veil()).toBeNull()
    watchdog.teardown()
    document.documentElement.removeAttribute("data-sw-legacy")
  })

  it("calls onVeilRearmed exactly when it actually repairs, so the document-scope registry can reconcile", async () => {
    installDarkTheme()
    const onVeilRearmed = vi.fn()
    const { watchdog } = await startWatchdog("auto", { onVeilRearmed })
    expect(onVeilRearmed).not.toHaveBeenCalled()

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(onVeilRearmed).toHaveBeenCalledTimes(1)
    watchdog.teardown()
  })

  it("does not call onVeilRearmed when there is nothing to repair (off/legacy/already-dark)", async () => {
    installDarkTheme()
    const onVeilRearmed = vi.fn()
    const { watchdog } = await startWatchdog("off", { onVeilRearmed })

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(onVeilRearmed).not.toHaveBeenCalled()
    watchdog.teardown()
  })
})

describe("coverage watchdog — the html-anchored legacy stylesheet", () => {
  it("records legacy.signal_mismatch when the <html>-anchored legacy stylesheet is wiped in place — outside the <head> observer's reach", async () => {
    installLegacyFilter()
    const recorder = createCoverageRecorder("test", false)
    const record = vi.spyOn(recorder, "record")
    const watchdog = createCoverageWatchdog(
      recorder,
      () => "legacy",
      () => false
    )
    const mismatchRecorded = (): boolean =>
      record.mock.calls.some(([e]) => e.kind === "legacy.signal_mismatch")

    watchdog.observe()
    await flushMicrotasks()
    expect(mismatchRecorded()).toBe(false)

    styleById(LEGACY_FILTER_STYLE_ID).textContent = ""
    await flushMicrotasks()

    expect(mismatchRecorded()).toBe(true)
    watchdog.teardown()
  })

  it("re-attaches to a re-created legacy stylesheet, and stops observing after teardown()", async () => {
    installLegacyFilter()
    const recorder = createCoverageRecorder("test", false)
    const count = vi.spyOn(recorder, "count")
    const watchdog = createCoverageWatchdog(
      recorder,
      () => "legacy",
      () => false
    )
    const checksSoFar = (): number =>
      count.mock.calls.filter(([name]) => name === "coverage_checks").length

    watchdog.observe()
    await flushMicrotasks()

    // Vendor removes and re-creates the element.
    document.getElementById(LEGACY_FILTER_STYLE_ID)?.remove()
    await flushMicrotasks()
    installLegacyFilter()
    await flushMicrotasks()
    const before = checksSoFar()

    const style = styleById(LEGACY_FILTER_STYLE_ID)
    style.textContent = ""
    await flushMicrotasks()
    expect(checksSoFar()).toBeGreaterThan(before)

    watchdog.teardown()
    const afterTeardown = checksSoFar()
    style.textContent = "html { filter: invert(1) !important; }"
    await flushMicrotasks()
    expect(checksSoFar()).toBe(afterTeardown)
  })
})

describe("coverage watchdog — the transitioning window", () => {
  const recorded = (recorder: CoverageRecorder, kind: string): boolean =>
    recorder.events().some((e) => e.kind === kind)

  it("observe-start records no coverage.violated/coverage.recovered pair while transitioning, before actuation has written anything", async () => {
    // Mirrors applyState: transitioning goes true, then observe() checks
    // synchronously before actuation writes any CoverageHeld artifact.
    let transitioning = true
    const { recorder, watchdog } = await startWatchdog("auto", {
      transitioning: () => transitioning,
    })
    expect(recorded(recorder, "coverage.violated")).toBe(false)

    // Actuation installs the artifacts and transitioning clears.
    installDarkTheme()
    transitioning = false
    watchdog.check("apply-state:auto")
    await flushMicrotasks()

    expect(recorded(recorder, "coverage.violated")).toBe(false)
    // No recovered event either: lastStatus never passed through "violated".
    expect(recorded(recorder, "coverage.recovered")).toBe(false)
    watchdog.teardown()
  })

  it("still catches a genuine coverage gap once transitioning clears — the flag widens the grace window, it does not silence the invariant", async () => {
    let transitioning = true
    const { recorder, watchdog } = await startWatchdog("auto", {
      transitioning: () => transitioning,
    })
    expect(recorded(recorder, "coverage.violated")).toBe(false)

    // Actuation installed nothing; the finally block still clears the flag.
    transitioning = false
    watchdog.check("apply-state:auto")
    await flushMicrotasks()

    expect(recorded(recorder, "coverage.violated")).toBe(true)
    watchdog.teardown()
  })
})

// ── createScopeCoverageWatchdog ───────────────────────────────────────────────

function fakeHold(): CustodyPrimitive {
  return { install: vi.fn(), release: vi.fn() }
}

function fakeRealization<Rho>(revision: Rho): CommittedRealization<Rho> {
  return { revision, install: vi.fn(), uninstall: vi.fn() }
}

function scopeSetup<Rho = unknown, Pi = unknown>(): {
  recorder: CoverageRecorder
  scopeCoverage: ScopeCoverageWatchdog<Rho, Pi>
  registry: ScopeRegistry<Rho, Pi>
} {
  const recorder = createCoverageRecorder("test", false)
  const scopeCoverage = createScopeCoverageWatchdog<Rho, Pi>(recorder)
  const registry = createScopeRegistry<Rho, Pi>(scopeCoverage.registryObserver)
  return { recorder, scopeCoverage, registry }
}

function register<Rho, Pi>(
  registry: ScopeRegistry<Rho, Pi>,
  id: string,
  ref: ScopeRef = document
): void {
  registry.register(id, {
    ref,
    parent: null,
    contentEpoch: 0,
    hold: fakeHold(),
  })
}

/** A fresh open shadow root on a host in the body, optionally holding a real occlusion veil. */
function newShadow(withHold = false): ShadowRoot {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })
  if (withHold) createOcclusionHold(shadow).install()
  return shadow
}

function counter(recorder: CoverageRecorder, name: string): number | undefined {
  return recorder.metrics.snapshot().counters[name]
}

function durationAgg(
  recorder: CoverageRecorder
): { count: number; max: number } | undefined {
  return recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]
}

/** The "scopes" snapshot's fields, read structurally. */
function scopesSnapshot(recorder: CoverageRecorder): {
  totalScopes: unknown
  byState: object
  scopes: Array<unknown>
  truncated: unknown
} {
  const snapshot = recorder.snapshotEntries()["scopes"]
  if (snapshot === null || typeof snapshot !== "object") {
    throw new Error("expected an object snapshot")
  }
  const byState = Reflect.get(snapshot, "byState")
  if (byState === null || typeof byState !== "object") {
    throw new Error("expected byState to be an object")
  }
  const scopes = Reflect.get(snapshot, "scopes")
  if (!Array.isArray(scopes)) {
    throw new Error("expected scopes to be an array")
  }
  return {
    totalScopes: Reflect.get(snapshot, "totalScopes"),
    byState,
    scopes,
    truncated: Reflect.get(snapshot, "truncated"),
  }
}

describe("createScopeCoverageWatchdog — event-driven cumulative counters", () => {
  it("counts a hold on register(), a release+commit on resolve-committed, and folds a state-duration observation on every transition after the first", async () => {
    const { recorder, registry } = scopeSetup<string>()

    register(registry, "s1")
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))

    expect(counter(recorder, "scope_holds")).toBe(1)
    expect(counter(recorder, "scope_releases")).toBe(1)
    expect(counter(recorder, "scope_commits")).toBe(1)
    // register() has no prior state to measure.
    expect(durationAgg(recorder)?.count).toBe(2)
  })

  it("clears the retired scope's duration-tracking entry, so a later registration under a reused id does not fold a duration spanning two identities", async () => {
    const { recorder, registry } = scopeSetup<string>()

    register(registry, "s1")
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))
    registry.retire("s1")
    registry.purge("s1")

    const countAfterRetire = durationAgg(recorder)?.count

    // A fresh registration folds nothing unless retire() left a stale entry.
    register(registry, "s1")

    expect(durationAgg(recorder)?.count).toBe(countAfterRetire)
  })

  it("counts a release+exoneration on resolve-exonerated", () => {
    const { recorder, registry } = scopeSetup<string, string>()
    register(registry, "s1")
    registry.startResolving("s1")
    registry.resolveExonerated("s1", { proof: "native-already-dark" })

    expect(counter(recorder, "scope_releases")).toBe(1)
    expect(counter(recorder, "scope_exonerations")).toBe(1)
    expect(recorder.events().some((e) => e.kind === "scope.exonerated")).toBe(
      true
    )
  })

  it("counts a failure with its reason on resolve-failed, without touching hold/release counters", () => {
    const { recorder, registry } = scopeSetup()
    register(registry, "s1")
    registry.startResolving("s1")
    registry.resolveFailed("s1", "no policy installed")

    expect(counter(recorder, "scope_failures")).toBe(1)
    expect(counter(recorder, "scope_releases")).toBeUndefined()
    const failEvent = recorder.events().find((e) => e.kind === "scope.failed")
    expect(failEvent?.detail).toEqual({
      id: "s1",
      reason: "no policy installed",
    })
  })

  it("counts a rehold on both invalidate() targets and on re-register()", async () => {
    const { recorder, registry } = scopeSetup<string, string>()
    register(registry, "s1")
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))
    registry.invalidate("s1") // COMMITTED -> RESOLVING
    registry.resolveExonerated("s1", { proof: "reason" })
    registry.invalidate("s1") // EXONERATED_NATIVE -> HELD
    registry.reRegister("s1", 1)

    expect(counter(recorder, "scope_reholds")).toBe(3)
  })

  it("counts a stale-discarded resolveCommitted() separately from any transition counter", async () => {
    const { recorder, registry } = scopeSetup<string>()
    register(registry, "s1")
    registry.startResolving("s1")

    let releaseInstall: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseInstall = resolve
    })
    const realization: CommittedRealization<string> = {
      revision: "rev-1",
      install: vi.fn(async () => {
        await gate
      }),
      uninstall: vi.fn(),
    }
    const pending = registry.resolveCommitted("s1", realization)
    registry.reRegister("s1", 1)
    releaseInstall?.()
    await pending

    expect(counter(recorder, "scope_stale_resolves_discarded")).toBe(1)
    expect(counter(recorder, "scope_commits")).toBeUndefined()
  })

  it("counts a discovered scope under census vs. reactive, per the method onDiscovered is called with", () => {
    const { recorder, scopeCoverage } = scopeSetup()

    scopeCoverage.onDiscovered("shadow:1", "census")
    scopeCoverage.onDiscovered("shadow:2", "reactive")
    scopeCoverage.onDiscovered("shadow:3", "reactive")

    expect(counter(recorder, "scopes_discovered_census")).toBe(1)
    expect(counter(recorder, "scopes_discovered_reactive")).toBe(2)
  })
})

describe("createScopeCoverageWatchdog — periodic per-scope snapshot and ScopeCoverageHeld", () => {
  it("check() publishes a per-scope snapshot with live byState counts and per-scope artifact presence, DISCOVERED_UNHELD pinned at zero", () => {
    // A shadow scope: its HELD artifact is createOcclusionHold()'s veil. The
    // document scope's artifacts are covered in coverage-observability.test.ts.
    const shadow = newShadow(true)
    const { recorder, scopeCoverage, registry } = scopeSetup()
    register(registry, "s1", shadow)

    scopeCoverage.check(registry, "test")

    expect(recorder.snapshotEntries()["scopes"]).toMatchObject({
      totalScopes: 1,
      byState: {
        HELD: 1,
        RESOLVING: 0,
        COMMITTED: 0,
        EXONERATED_NATIVE: 0,
        FAILED_HELD: 0,
        RETIRED: 0,
        DISCOVERED_UNHELD: 0,
      },
      scopes: [{ id: "s1", kind: "HELD", parent: null, artifactPresent: true }],
    })
  })

  it("does not re-write the snapshot or re-count scope_coverage_checks across consecutive checks when nothing changed (an idle tab must not flush the recorder forever)", () => {
    const shadow = newShadow(true)
    const { recorder, scopeCoverage, registry } = scopeSetup()
    const setSnapshotSpy = vi.spyOn(recorder, "setSnapshot")
    register(registry, "s1", shadow)

    scopeCoverage.check(registry, "first")
    expect(setSnapshotSpy).toHaveBeenCalledTimes(1)
    expect(counter(recorder, "scope_coverage_checks")).toBe(1)

    scopeCoverage.check(registry, "second")
    scopeCoverage.check(registry, "third")

    expect(setSnapshotSpy).toHaveBeenCalledTimes(1)
    expect(counter(recorder, "scope_coverage_checks")).toBe(1)

    // A real change still writes, on the very next check.
    registry.startResolving("s1")
    scopeCoverage.check(registry, "fourth")
    expect(setSnapshotSpy).toHaveBeenCalledTimes(2)
    expect(counter(recorder, "scope_coverage_checks")).toBe(2)
  })

  it("caps the itemized scopes list at MAX_SNAPSHOT_SCOPE_ENTRIES and marks the snapshot truncated, while byState/totalScopes stay accurate over every live scope", () => {
    const { recorder, scopeCoverage, registry } = scopeSetup()

    const total = 120
    for (let i = 0; i < total; i++) {
      register(registry, `shadow:${i}`, newShadow())
    }

    scopeCoverage.check(registry, "test")

    const snapshot = scopesSnapshot(recorder)
    expect(snapshot.totalScopes).toBe(total)
    expect(Reflect.get(snapshot.byState, "HELD")).toBe(total)
    expect(snapshot.scopes.length).toBeLessThan(total)
    expect(snapshot.truncated).toBe(true)
  })

  it("prioritizes violating scopes over healthy ones when truncating the itemized list, so a real violation past the cap is never hidden from debug.html", () => {
    const { recorder, scopeCoverage, registry } = scopeSetup()

    for (let i = 0; i < MAX_SNAPSHOT_SCOPE_ENTRIES; i++) {
      register(registry, `shadow:${i}`, newShadow(true))
    }
    // Registered last, past the cap, with no veil: a plain slice would drop it.
    register(registry, "shadow:violating", newShadow())

    scopeCoverage.check(registry, "test")

    const snapshot = scopesSnapshot(recorder)
    expect(snapshot.totalScopes).toBe(MAX_SNAPSHOT_SCOPE_ENTRIES + 1)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.scopes.length).toBe(MAX_SNAPSHOT_SCOPE_ENTRIES)
    expect(
      snapshot.scopes.some(
        (s: unknown) =>
          typeof s === "object" &&
          s !== null &&
          Reflect.get(s, "id") === "shadow:violating"
      )
    ).toBe(true)
  })

  it("flags, then recovers, a COMMITTED scope whose adoptedStyleSheets were reassigned out from under the registry — a vendor reassignment that generates no registry transition", async () => {
    const shadow = newShadow()
    const { recorder, scopeCoverage, registry } = scopeSetup<string>()
    register(registry, "s1", shadow)
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))

    // Stand in for the `:host` token rule realizeShadowColors() adopts on a
    // real commit (see HOST_TOKEN_RULE_SIGNATURE).
    const hostTokenSheet = new CSSStyleSheet()
    hostTokenSheet.insertRule(":host { --sw-bg-0: #171c25; }")
    shadow.adoptedStyleSheets = [hostTokenSheet]

    scopeCoverage.check(registry, "before")
    expect(counter(recorder, "scope_coverage_violations")).toBeUndefined()

    // A vendor's wholesale reassignment carries our sheet off with no
    // MutationRecord; the registry still believes s1 is COMMITTED.
    const vendorSheet = new CSSStyleSheet()
    vendorSheet.insertRule("div { color: blue; }")
    shadow.adoptedStyleSheets = [vendorSheet]
    scopeCoverage.check(registry, "after-reassignment")

    await Promise.resolve()
    await Promise.resolve()

    expect(counter(recorder, "scope_coverage_violations")).toBe(1)
    expect(
      recorder.events().some((e) => e.kind === "scope.coverage_violated")
    ).toBe(true)

    shadow.adoptedStyleSheets = [vendorSheet, hostTokenSheet]
    scopeCoverage.check(registry, "after-repair")
    await Promise.resolve()
    await Promise.resolve()

    expect(
      recorder.events().some((e) => e.kind === "scope.coverage_recovered")
    ).toBe(true)
  })

  it("observe() polls at SCOPE_COVERAGE_POLL_MS and teardown() stops it", () => {
    vi.useFakeTimers()
    try {
      const { recorder, scopeCoverage, registry } = scopeSetup()

      scopeCoverage.observe(registry)
      const checksAfterStart = counter(recorder, "scope_coverage_checks") ?? 0
      expect(checksAfterStart).toBeGreaterThanOrEqual(1)

      register(registry, "s1")
      vi.advanceTimersByTime(1000)

      const checksAfterPoll = counter(recorder, "scope_coverage_checks") ?? 0
      expect(checksAfterPoll).toBeGreaterThan(checksAfterStart)
      expect(recorder.snapshotEntries()["scopes"]).toMatchObject({
        totalScopes: 1,
      })

      scopeCoverage.teardown()
      const checksAfterTeardown = counter(recorder, "scope_coverage_checks")
      vi.advanceTimersByTime(1000)
      expect(counter(recorder, "scope_coverage_checks")).toBe(
        checksAfterTeardown
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("teardown() folds each still-tracked scope's open interval into scope_state_duration_ms before clearing it", () => {
    vi.useFakeTimers()
    try {
      const { recorder, scopeCoverage, registry } = scopeSetup()
      register(registry, "s1")

      const countBeforeTeardown = durationAgg(recorder)?.count ?? 0

      // A long resting interval with no further transition.
      const restingMs = 3_600_000
      vi.advanceTimersByTime(restingMs)

      scopeCoverage.teardown()

      const agg = durationAgg(recorder)
      expect(agg?.count).toBe(countBeforeTeardown + 1)
      expect(agg?.max).toBeGreaterThanOrEqual(restingMs)
    } finally {
      vi.useRealTimers()
    }
  })
})
