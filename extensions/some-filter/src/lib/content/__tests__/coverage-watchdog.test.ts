import { createOcclusionHold } from "@filter/adapter/custody-primitive"
import {
  createScopeRegistry,
  type CommittedRealization,
  type CustodyPrimitive,
  type ScopeRef,
} from "@filter/adapter/scope-registry"
import { createCoverageRecorder } from "@filter/lib/content/coverage-observability"
import {
  createCoverageWatchdog,
  createScopeCoverageWatchdog,
} from "@filter/lib/content/coverage-watchdog"
import { PREPAINT_VEIL_ID } from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
} from "@filter/lib/content/theme-apply"
import type { TabState } from "@filter/types/tab"
import { afterEach, describe, expect, it, vi } from "vitest"

// The watchdog's repair runs behind runInvariants()'s async chain, itself
// behind the MutationObserver callback's own microtask-scheduled delivery —
// see pipeline.test.ts's recordsFrom() helper for the same two-hop pattern.
// A generous, cheap flush avoids pinning an exact microtask count to this
// module's internal await depth.
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
  document.head.querySelectorAll("style").forEach((el) => el.remove())
})

describe("coverage watchdog — dark-signal desync repair", () => {
  it("re-arms the veil when a <head> replacement carries off #__sw_dark_theme but data-sw-dark survives", async () => {
    installDarkTheme()
    const tabState: TabState = "auto"
    const recorder = createCoverageRecorder("test-dark-desync", false)
    const watchdog = createCoverageWatchdog(recorder, () => tabState)

    watchdog.observe()
    await flushMicrotasks()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    // Simulate the vendor flush: only the stylesheet is carried off.
    // data-sw-dark lives on <html>, outside <head>, and survives.
    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)

    watchdog.teardown()
  })

  it("re-arms the veil when the stylesheet is retained but its textContent is wiped in place", async () => {
    // A vendor reconciler that keeps the <style> node but clears/replaces its
    // text is invisible to a childList-only observer on <head> itself (the
    // mutation's target is the <style> element, a descendant) and to
    // pipeline.ts's Sensor (the target carries [data-my-ext] and is filtered
    // as self-authored) — the exact gap the head observer's subtree +
    // characterData options close.
    installDarkTheme()
    const tabState: TabState = "auto"
    const recorder = createCoverageRecorder("test-dark-desync-wipe", false)
    const watchdog = createCoverageWatchdog(recorder, () => tabState)

    watchdog.observe()
    await flushMicrotasks()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    const style = document.getElementById(DARK_THEME_STYLE_ID)
    if (style === null) throw new Error("dark theme style missing")
    style.textContent = ""
    await flushMicrotasks()

    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)

    watchdog.teardown()
  })

  it("does not repair while the tab is off", async () => {
    installDarkTheme()
    const tabState: TabState = "off"
    const recorder = createCoverageRecorder("test-dark-desync-off", false)
    const watchdog = createCoverageWatchdog(recorder, () => tabState)

    watchdog.observe()
    await flushMicrotasks()

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    watchdog.teardown()
  })

  it("does not repair a genuine already-dark verdict — restoreVendor() drops both signals together", async () => {
    installDarkTheme()
    const tabState: TabState = "auto"
    const recorder = createCoverageRecorder("test-dark-restore-native", false)
    const watchdog = createCoverageWatchdog(recorder, () => tabState)

    watchdog.observe()
    await flushMicrotasks()

    // Mirrors theme-apply.ts's deactivateDarkTheme(): attribute and
    // stylesheet removed together, not left to drift apart.
    document.documentElement.removeAttribute(DARK_THEME_ATTR)
    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    watchdog.teardown()
  })

  it("does not repair in legacy mode, where the veil's own color depends on the (possibly stale) legacy attribute", async () => {
    document.documentElement.setAttribute("data-sw-legacy", "")
    const tabState: TabState = "legacy"
    const recorder = createCoverageRecorder("test-dark-desync-legacy", false)
    const watchdog = createCoverageWatchdog(recorder, () => tabState)

    watchdog.observe()
    await flushMicrotasks()

    // A legacy tab should never carry data-sw-dark, but even a stray one
    // must not trigger the dark-only repair path outside auto mode.
    document.documentElement.setAttribute(DARK_THEME_ATTR, "")
    await flushMicrotasks()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    watchdog.teardown()
    document.documentElement.removeAttribute("data-sw-legacy")
  })

  it("calls onVeilRearmed exactly when it actually repairs — SF-BS (#1266)'s registry needs to know", async () => {
    // The registry-tracked custodian (document-scope.ts) does not own this
    // repair's own enablePrepaint() call, same as yt-navigate-start's own
    // direct call — a caller with custody bookkeeping (content.ts) needs a
    // signal exactly when this repair fires, not on every check.
    installDarkTheme()
    const tabState: TabState = "auto"
    const recorder = createCoverageRecorder("test-dark-desync-callback", false)
    const onVeilRearmed = vi.fn()
    const watchdog = createCoverageWatchdog(
      recorder,
      () => tabState,
      onVeilRearmed
    )

    watchdog.observe()
    await flushMicrotasks()
    expect(onVeilRearmed).not.toHaveBeenCalled()

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(onVeilRearmed).toHaveBeenCalledTimes(1)

    watchdog.teardown()
  })

  it("does not call onVeilRearmed when there is nothing to repair (off/legacy/already-dark)", async () => {
    installDarkTheme()
    const tabState: TabState = "off"
    const recorder = createCoverageRecorder(
      "test-dark-desync-callback-off",
      false
    )
    const onVeilRearmed = vi.fn()
    const watchdog = createCoverageWatchdog(
      recorder,
      () => tabState,
      onVeilRearmed
    )

    watchdog.observe()
    await flushMicrotasks()

    document.getElementById(DARK_THEME_STYLE_ID)?.remove()
    await flushMicrotasks()

    expect(onVeilRearmed).not.toHaveBeenCalled()

    watchdog.teardown()
  })
})

// ── SF-OB (#1270): createScopeCoverageWatchdog ──────────────────────────────

function fakeHold(): CustodyPrimitive {
  return { install: vi.fn(), release: vi.fn() }
}

function fakeRealization<Rho>(revision: Rho): CommittedRealization<Rho> {
  return { revision, install: vi.fn(), uninstall: vi.fn() }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("createScopeCoverageWatchdog — event-driven cumulative counters", () => {
  it("counts a hold on register(), a release+commit on resolve-committed, and folds a state-duration observation on every transition after the first", async () => {
    const recorder = createCoverageRecorder("test-scope-holds", false)
    const scopeCoverage = createScopeCoverageWatchdog<string>(recorder)
    const registry = createScopeRegistry<string>(scopeCoverage.registryObserver)

    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))

    const counters = recorder.metrics.snapshot().counters
    expect(counters["scope_holds"]).toBe(1)
    expect(counters["scope_releases"]).toBe(1)
    expect(counters["scope_commits"]).toBe(1)

    const durationAgg =
      recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]
    // One observation per transition after the scope's first (register does
    // not yet have a prior state to measure the duration of).
    expect(durationAgg?.count).toBe(2)
  })

  it("clears the retired scope's own duration-tracking entry, so a later registration under a reused id does not fold a bogus duration spanning two unrelated identities (bot-found, #1327's own review, round 4)", async () => {
    const recorder = createCoverageRecorder("test-scope-retire-cleanup", false)
    const scopeCoverage = createScopeCoverageWatchdog<string>(recorder)
    const registry = createScopeRegistry<string>(scopeCoverage.registryObserver)

    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))
    registry.retire("s1")
    registry.purge("s1")

    const countAfterRetire =
      recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]?.count

    // register() on a genuinely fresh id never folds a duration (no prior
    // state to measure) — this only stays true here if retire() above
    // actually cleared "s1"'s own enteredAt entry; otherwise this second
    // registration reads the retired scope's stale timestamp and folds a
    // duration spanning two unrelated identities.
    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })

    expect(
      recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]?.count
    ).toBe(countAfterRetire)
  })

  it("counts a release+exoneration on resolve-exonerated", () => {
    const recorder = createCoverageRecorder("test-scope-exonerate", false)
    const scopeCoverage = createScopeCoverageWatchdog<string, string>(recorder)
    const registry = createScopeRegistry<string, string>(
      scopeCoverage.registryObserver
    )
    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    registry.resolveExonerated("s1", { proof: "native-already-dark" })

    const counters = recorder.metrics.snapshot().counters
    expect(counters["scope_releases"]).toBe(1)
    expect(counters["scope_exonerations"]).toBe(1)
    expect(recorder.events().some((e) => e.kind === "scope.exonerated")).toBe(
      true
    )
  })

  it("counts a failure with its reason on resolve-failed, without touching hold/release counters", () => {
    const recorder = createCoverageRecorder("test-scope-fail", false)
    const scopeCoverage = createScopeCoverageWatchdog(recorder)
    const registry = createScopeRegistry(scopeCoverage.registryObserver)
    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    registry.resolveFailed("s1", "no policy installed")

    const counters = recorder.metrics.snapshot().counters
    expect(counters["scope_failures"]).toBe(1)
    expect(counters["scope_releases"]).toBeUndefined()
    const failEvent = recorder.events().find((e) => e.kind === "scope.failed")
    expect(failEvent?.detail).toEqual({
      id: "s1",
      reason: "no policy installed",
    })
  })

  it("counts a rehold on both invalidate() targets and on re-register()", async () => {
    const recorder = createCoverageRecorder("test-scope-rehold", false)
    const scopeCoverage = createScopeCoverageWatchdog<string, string>(recorder)
    const registry = createScopeRegistry<string, string>(
      scopeCoverage.registryObserver
    )
    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))
    registry.invalidate("s1") // COMMITTED -> RESOLVING
    registry.resolveExonerated("s1", { proof: "reason" })
    registry.invalidate("s1") // EXONERATED_NATIVE -> HELD
    registry.reRegister("s1", 1)

    expect(recorder.metrics.snapshot().counters["scope_reholds"]).toBe(3)
  })

  it("counts a stale-discarded resolveCommitted() separately from any transition counter", async () => {
    const recorder = createCoverageRecorder("test-scope-stale", false)
    const scopeCoverage = createScopeCoverageWatchdog<string>(recorder)
    const registry = createScopeRegistry<string>(scopeCoverage.registryObserver)
    registry.register("s1", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
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

    expect(
      recorder.metrics.snapshot().counters["scope_stale_resolves_discarded"]
    ).toBe(1)
    expect(
      recorder.metrics.snapshot().counters["scope_commits"]
    ).toBeUndefined()
  })

  it("counts a discovered scope under census vs. reactive, per the method onDiscovered is called with", () => {
    const recorder = createCoverageRecorder("test-scope-discovered", false)
    const scopeCoverage = createScopeCoverageWatchdog(recorder)

    scopeCoverage.onDiscovered("shadow:1", "census")
    scopeCoverage.onDiscovered("shadow:2", "reactive")
    scopeCoverage.onDiscovered("shadow:3", "reactive")

    const counters = recorder.metrics.snapshot().counters
    expect(counters["scopes_discovered_census"]).toBe(1)
    expect(counters["scopes_discovered_reactive"]).toBe(2)
  })
})

describe("createScopeCoverageWatchdog — periodic per-scope snapshot and ScopeCoverageHeld", () => {
  it("check() publishes a per-scope snapshot with live byState counts and per-scope artifact presence, DISCOVERED_UNHELD pinned at zero", () => {
    // A shadow scope, not the document — its HELD artifact is
    // createOcclusionHold()'s own veil; the document scope's own artifacts
    // are exercised separately below and in coverage-observability.test.ts
    // (bot-found, #1327's own review: this codebase's actual
    // createPrepaintCustody() never installs an occlusion hold at all, so a
    // document-ref'd scope needs its own dedicated fixture).
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    createOcclusionHold(shadow).install()

    const recorder = createCoverageRecorder("test-scope-snapshot", false)
    const scopeCoverage = createScopeCoverageWatchdog(recorder)
    const registry = createScopeRegistry(scopeCoverage.registryObserver)
    registry.register("s1", {
      ref: shadow,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })

    scopeCoverage.check(registry, "test")

    const snapshot = recorder.snapshotEntries()["scopes"]
    expect(snapshot).toMatchObject({
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

  it("does not re-write the snapshot or re-count scope_coverage_checks across consecutive checks when nothing changed (bot-found, #1327's own review — an idle tab must not flush the recorder forever)", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    createOcclusionHold(shadow).install()

    const recorder = createCoverageRecorder("test-scope-no-churn", false)
    const setSnapshotSpy = vi.spyOn(recorder, "setSnapshot")
    const scopeCoverage = createScopeCoverageWatchdog(recorder)
    const registry = createScopeRegistry(scopeCoverage.registryObserver)
    registry.register("s1", {
      ref: shadow,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })

    scopeCoverage.check(registry, "first")
    expect(setSnapshotSpy).toHaveBeenCalledTimes(1)
    expect(recorder.metrics.snapshot().counters["scope_coverage_checks"]).toBe(
      1
    )

    scopeCoverage.check(registry, "second")
    scopeCoverage.check(registry, "third")

    expect(setSnapshotSpy).toHaveBeenCalledTimes(1)
    expect(recorder.metrics.snapshot().counters["scope_coverage_checks"]).toBe(
      1
    )

    // A real change still writes, on the very next check.
    registry.startResolving("s1")
    scopeCoverage.check(registry, "fourth")
    expect(setSnapshotSpy).toHaveBeenCalledTimes(2)
    expect(recorder.metrics.snapshot().counters["scope_coverage_checks"]).toBe(
      2
    )
  })

  it("caps the itemized scopes list at MAX_SNAPSHOT_SCOPE_ENTRIES and marks the snapshot truncated, while byState/totalScopes stay accurate over every live scope (bot-found, #1327's own review)", () => {
    const recorder = createCoverageRecorder("test-scope-truncation", false)
    const scopeCoverage = createScopeCoverageWatchdog(recorder)
    const registry = createScopeRegistry(scopeCoverage.registryObserver)

    const total = 120
    for (let i = 0; i < total; i++) {
      const host = document.createElement("div")
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: "open" })
      registry.register(`shadow:${i}`, {
        ref: shadow,
        parent: null,
        contentEpoch: 0,
        hold: fakeHold(),
      })
    }

    scopeCoverage.check(registry, "test")

    const snapshot = recorder.snapshotEntries()["scopes"]
    if (snapshot === null || typeof snapshot !== "object") {
      throw new Error("expected an object snapshot")
    }
    expect(Reflect.get(snapshot, "totalScopes")).toBe(total)

    const byState = Reflect.get(snapshot, "byState")
    if (byState === null || typeof byState !== "object") {
      throw new Error("expected byState to be an object")
    }
    expect(Reflect.get(byState, "HELD")).toBe(total)

    const scopesList = Reflect.get(snapshot, "scopes")
    if (!Array.isArray(scopesList)) {
      throw new Error("expected scopes to be an array")
    }
    expect(scopesList.length).toBeLessThan(total)
    expect(Reflect.get(snapshot, "truncated")).toBe(true)
  })

  it("flags, then recovers, a COMMITTED scope whose adoptedStyleSheets were reassigned out from under the registry — #1280's own tracked vendor-reassignment scenario, which generates no registry transition at all to signal it", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const recorder = createCoverageRecorder("test-scope-desync", false)
    const scopeCoverage = createScopeCoverageWatchdog<string>(recorder)
    const registry = createScopeRegistry<string>(scopeCoverage.registryObserver)
    const ref: ScopeRef = shadow
    registry.register("s1", {
      ref,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1"))

    // fakeRealization()'s own install() is a no-op mock — stand in for what
    // shadow-actuator.ts's realizeShadowColors() actually adopts on a real
    // commit (bot-found round 2: this is the artifact a COMMITTED shadow
    // scope is actually guaranteed to have, not data-sw-patched — see
    // coverage-observability.ts's own HOST_TOKEN_RULE_SIGNATURE doc comment).
    const hostTokenSheet = new CSSStyleSheet()
    hostTokenSheet.insertRule(":host { --sw-bg-0: #171c25; }")
    shadow.adoptedStyleSheets = [hostTokenSheet]

    scopeCoverage.check(registry, "before")
    expect(
      recorder.metrics.snapshot().counters["scope_coverage_violations"]
    ).toBeUndefined()

    // The desync: a vendor component's own wholesale adoptedStyleSheets
    // reassignment (#1280's own tracked follow-up, filed off PR #1279's own
    // review) carries our sheet off with no MutationRecord to react to —
    // the registry still believes s1 is COMMITTED throughout, exactly the
    // "declared vs actual" gap CoverageHeld's own dark/legacy signal-pair
    // checks catch at document granularity, generalized here to a shadow
    // scope.
    const vendorSheet = new CSSStyleSheet()
    vendorSheet.insertRule("div { color: blue; }")
    shadow.adoptedStyleSheets = [vendorSheet]
    scopeCoverage.check(registry, "after-reassignment")

    await Promise.resolve()
    await Promise.resolve()

    expect(
      recorder.metrics.snapshot().counters["scope_coverage_violations"]
    ).toBe(1)
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
      const recorder = createCoverageRecorder("test-scope-poll", false)
      const scopeCoverage = createScopeCoverageWatchdog(recorder)
      const registry = createScopeRegistry(scopeCoverage.registryObserver)

      scopeCoverage.observe(registry)
      const checksAfterStart =
        recorder.metrics.snapshot().counters["scope_coverage_checks"] ?? 0
      expect(checksAfterStart).toBeGreaterThanOrEqual(1)

      registry.register("s1", {
        ref: document,
        parent: null,
        contentEpoch: 0,
        hold: fakeHold(),
      })
      vi.advanceTimersByTime(1000)

      const checksAfterPoll =
        recorder.metrics.snapshot().counters["scope_coverage_checks"] ?? 0
      expect(checksAfterPoll).toBeGreaterThan(checksAfterStart)
      expect(recorder.snapshotEntries()["scopes"]).toMatchObject({
        totalScopes: 1,
      })

      scopeCoverage.teardown()
      const checksAfterTeardown =
        recorder.metrics.snapshot().counters["scope_coverage_checks"]
      vi.advanceTimersByTime(1000)
      expect(
        recorder.metrics.snapshot().counters["scope_coverage_checks"]
      ).toBe(checksAfterTeardown)
    } finally {
      vi.useRealTimers()
    }
  })

  it("teardown() folds each still-tracked scope's own open interval into scope_state_duration_ms before clearing it, instead of discarding it outright (bot-found, #1327's own review, round 5)", () => {
    vi.useFakeTimers()
    try {
      const recorder = createCoverageRecorder(
        "test-scope-teardown-duration",
        false
      )
      const scopeCoverage = createScopeCoverageWatchdog(recorder)
      const registry = createScopeRegistry(scopeCoverage.registryObserver)

      registry.register("s1", {
        ref: document,
        parent: null,
        contentEpoch: 0,
        hold: fakeHold(),
      })

      const countBeforeTeardown =
        recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]
          ?.count ?? 0

      // A long resting interval — e.g. a tab sitting COMMITTED for hours —
      // with no further transition before this watchdog tears down.
      const restingMs = 3_600_000
      vi.advanceTimersByTime(restingMs)

      scopeCoverage.teardown()

      const agg =
        recorder.metrics.snapshot().aggregates["scope_state_duration_ms"]
      expect(agg?.count).toBe(countBeforeTeardown + 1)
      expect(agg?.max).toBeGreaterThanOrEqual(restingMs)
    } finally {
      vi.useRealTimers()
    }
  })
})
