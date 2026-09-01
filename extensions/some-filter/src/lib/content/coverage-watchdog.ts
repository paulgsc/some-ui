/**
 * The coverage watchdog — a Sensor dedicated to self-observation, separate
 * from `adapter/pipeline.ts`'s theming Sensor.
 *
 * Re-reads the live DOM artifacts `coverage-observability.ts`'s
 * `CoverageContext` needs (the veil, `data-sw-dark`, `data-sw-legacy`, the
 * legacy `<style>` tag's own text) on every mutation that could plausibly
 * have touched one of them, and evaluates the invariants against what is
 * actually there — never against what `content.ts` last believed it did.
 * See `coverage-observability.ts`'s header comment for why that distinction
 * is the whole point.
 *
 * ## Scope of observation, and why it stays cheap
 *
 * Two observers, neither with `subtree: true`:
 *
 *   - one on `document.documentElement` (`childList` + a narrow
 *     `attributeFilter`) — catches `<head>`/`<body>` being swapped wholesale
 *     (they are `<html>`'s direct children) and `<html>`'s own attributes
 *     changing. The legacy `<style>` tag (`theme-apply.ts`'s
 *     `applyLegacyFilter`) is itself anchored directly on `<html>`, not
 *     `<head>` — the same head-swap vulnerability this watchdog exists to
 *     catch used to be able to carry that stylesheet off silently, so it no
 *     longer lives somewhere a whole-`<head>` replacement can take it with
 *     it. This observer's `childList` on `documentElement` is what notices
 *     it being individually added or removed now.
 *   - one on `document.head` (`childList` only) — a generic backstop for
 *     any *other* extension-owned artifact under `<head>` (today, nothing
 *     `CoverageContext` reads lives there) being individually added or
 *     removed without the rest of `<head>` going with it.
 *
 * `pipeline.ts`'s own Sensor already pays for a `subtree: true` walk in auto
 * mode, because it needs to find every vendor surface. This watchdog needs
 * none of that — every fact `CoverageContext` reads is reachable by id/
 * attribute lookup — so it deliberately does not reuse that observer or its
 * scope. A page as busy as a YouTube watch page can emit thousands of
 * subtree mutations a minute; a `childList`-only pair of observers is
 * unaffected by all of them and only fires for the handful that could matter
 * here, which is what makes running the check *un-throttled* affordable (the
 * whole reason to avoid debouncing it is in `coverage-observability.ts`'s
 * header — a coalesced check could straddle exactly the race it exists to
 * catch).
 *
 * The head observer is re-attached whenever the html observer sees `<head>`
 * itself get replaced (the `document.head` a listener captured at `observe()`
 * time is not the live one after that).
 */

import {
  DARK_THEME_ATTR,
  LEGACY_FILTER_STYLE_ID,
  LEGACY_THEME_ATTR,
} from "@filter/lib/content/theme-apply"
import type { TabState } from "@filter/types/tab"
import { runInvariants } from "@some-extension/common/observability"

import {
  coverageInvariants,
  type CoverageContext,
  type CoverageCounter,
  type CoverageEventKind,
  type CoverageRecorder,
} from "./coverage-observability"
import { PREPAINT_DIRTY_CLASS, PREPAINT_VEIL_ID } from "./prepaint"

export type CoverageWatchdog = {
  /** Attach both observers. Idempotent. */
  observe(): void
  /** Force an immediate check outside of the mutation-driven path — call right after a state transition or nav event so the timeline records the moment that happened, not just the next incidental mutation. */
  check(reason: string): void
  /** Disconnect both observers. Safe to call when not observing. */
  teardown(): void
}

/** Which event pair, and which counter, each invariant's violation maps to. */
const EVENT_FOR: Readonly<
  Record<string, { violated: CoverageEventKind; recovered: CoverageEventKind }>
> = {
  CoverageHeld: {
    violated: "coverage.violated",
    recovered: "coverage.recovered",
  },
  LegacySignalsAgree: {
    violated: "legacy.signal_mismatch",
    recovered: "legacy.signal_resolved",
  },
  VeilColorMatchesLegacyState: {
    violated: "veil.color_mismatch",
    recovered: "veil.color_resolved",
  },
}

const COUNTER_FOR: Readonly<Record<string, CoverageCounter>> = {
  CoverageHeld: "coverage_violations",
  LegacySignalsAgree: "legacy_signal_mismatches",
  VeilColorMatchesLegacyState: "veil_color_mismatches",
}

function collectContext(getTabState: () => TabState): CoverageContext {
  const html = document.documentElement
  const veil = document.getElementById(PREPAINT_VEIL_ID)
  const legacyStyle = document.getElementById(LEGACY_FILTER_STYLE_ID)

  return {
    now: Date.now(),
    tabState: getTabState(),
    veilPresent: veil !== null,
    dirtyClassPresent: html.classList.contains(PREPAINT_DIRTY_CLASS),
    darkThemeActive: html.hasAttribute(DARK_THEME_ATTR),
    legacyAttrPresent: html.hasAttribute(LEGACY_THEME_ATTR),
    legacyStyleActive: legacyStyle?.textContent.includes("filter:") ?? false,
    veilBackgroundColor:
      veil instanceof HTMLElement
        ? getComputedStyle(veil).backgroundColor
        : null,
  }
}

export function createCoverageWatchdog(
  recorder: CoverageRecorder,
  getTabState: () => TabState
): CoverageWatchdog {
  let htmlObserver: MutationObserver | null = null
  let headObserver: MutationObserver | null = null
  let observedHead: HTMLHeadElement | null = null
  // Invariant name -> epoch ms the violation started, for the duration aggregate.
  const violatedSince = new Map<string, number>()
  let lastStatus = new Map<string, "ok" | "violated" | "unknown">()

  function attachHeadObserver(): void {
    if (observedHead === document.head) return
    headObserver?.disconnect()
    observedHead = document.head
    headObserver = new MutationObserver(() => check("head-mutation"))
    headObserver.observe(document.head, { childList: true })
  }

  function check(reason: string): void {
    const ctx = collectContext(getTabState)
    recorder.count("coverage_checks")
    recorder.setSnapshot("coverage", { ...ctx, reason })

    // Fire-and-forget: the check itself must stay synchronous (see this
    // module's header) but recording the outcome need not block it.
    void runInvariants(coverageInvariants, ctx, ctx.now).then((results) => {
      for (const result of results) {
        const previous = lastStatus.get(result.name)
        lastStatus.set(result.name, result.status)
        if (result.status === previous) continue

        const events = EVENT_FOR[result.name]
        const counter = COUNTER_FOR[result.name]
        if (events === undefined) continue

        if (result.status === "violated") {
          violatedSince.set(result.name, ctx.now)
          if (counter !== undefined) recorder.count(counter)
          recorder.record({
            kind: events.violated,
            severity: "error",
            detail: { reason, details: result.details ?? null },
          })
          continue
        }

        if (result.status === "ok" && previous === "violated") {
          const since = violatedSince.get(result.name)
          violatedSince.delete(result.name)
          if (since !== undefined) {
            recorder.observe("violation_duration_ms", ctx.now - since)
          }
          recorder.record({
            kind: events.recovered,
            detail: {
              reason,
              heldForMs: since !== undefined ? ctx.now - since : null,
            },
          })
        }
      }
    })
  }

  return {
    observe(): void {
      if (htmlObserver !== null) return
      htmlObserver = new MutationObserver(() => {
        attachHeadObserver()
        check("html-mutation")
      })
      htmlObserver.observe(document.documentElement, {
        childList: true,
        attributes: true,
        attributeFilter: ["class", DARK_THEME_ATTR, LEGACY_THEME_ATTR],
      })
      attachHeadObserver()
      lastStatus = new Map()
      violatedSince.clear()
      check("observe-start")
    },
    check,
    teardown(): void {
      htmlObserver?.disconnect()
      htmlObserver = null
      headObserver?.disconnect()
      headObserver = null
      observedHead = null
    },
  }
}
