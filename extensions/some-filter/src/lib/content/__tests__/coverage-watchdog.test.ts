import { createCoverageRecorder } from "@filter/lib/content/coverage-observability"
import { createCoverageWatchdog } from "@filter/lib/content/coverage-watchdog"
import { PREPAINT_VEIL_ID } from "@filter/lib/content/prepaint"
import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
} from "@filter/lib/content/theme-apply"
import type { TabState } from "@filter/types/tab"
import { afterEach, describe, expect, it } from "vitest"

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
})
