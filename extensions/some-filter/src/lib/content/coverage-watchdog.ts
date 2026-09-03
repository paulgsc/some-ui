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
 *     changing;
 *   - one on `document.head` (`childList` + `subtree` + `characterData`) —
 *     catches the legacy/dark `<style>` tag being individually added or
 *     removed without the rest of `<head>` going with it, *and* a vendor
 *     reconciler that retains the tag but clears or replaces its own
 *     `textContent` in place (a `childList` mutation on the `<style>`
 *     element itself, a descendant of `<head>`, not on `<head>` directly —
 *     invisible to a non-subtree observer here, and invisible to
 *     `pipeline.ts`'s own Sensor too, since that mutation's target carries
 *     `[data-my-ext]` and is filtered out as self-authored). `subtree`
 *     stays scoped to `<head>`, not `<html>`, so it does not become the
 *     `subtree: true` walk this module's intro explains the cost of
 *     avoiding — `<head>`'s children churn nowhere near as often as
 *     `<body>`'s.
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
 *
 * ## Not purely observational
 *
 * One violation gets repaired here, not just recorded: `DarkSignalsAgree`
 * (`data-sw-dark` still declared true while `#__sw_dark_theme`'s actual CSS
 * is gone) re-arms the prepaint veil — see `repairDarkDesync()`. That is the
 * one gap this watchdog is positioned to close safely and unambiguously; the
 * legacy pair and the general "nothing at all is covering the page" case are
 * left to the existing recovery paths (nav-finish, the pipeline's own
 * reactive rescan) for reasons `repairDarkDesync()`'s own comment covers.
 *
 * That repair calls `enablePrepaint()` directly — a path SF-BS's (#1266)
 * document-scope registry does not own, same as `yt-navigate-start`'s own
 * direct call. `createCoverageWatchdog()`'s optional `onVeilRearmed`
 * callback exists so a caller tracking that registry's custody (content.ts,
 * via `documentScope.reengage()`) can reconcile exactly when this repair
 * fires, not just when navigation does — a plain cache-only reset is not
 * enough here either (see `document-scope.ts`'s own header for the race
 * that left open).
 */

import {
  DARK_THEME_ATTR,
  DARK_THEME_STYLE_ID,
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
import {
  enablePrepaint,
  PREPAINT_DIRTY_CLASS,
  PREPAINT_VEIL_ID,
} from "./prepaint"

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
  DarkSignalsAgree: {
    violated: "dark.signal_mismatch",
    recovered: "dark.signal_resolved",
  },
  VeilColorMatchesLegacyState: {
    violated: "veil.color_mismatch",
    recovered: "veil.color_resolved",
  },
}

const COUNTER_FOR: Readonly<Record<string, CoverageCounter>> = {
  CoverageHeld: "coverage_violations",
  LegacySignalsAgree: "legacy_signal_mismatches",
  DarkSignalsAgree: "dark_signal_mismatches",
  VeilColorMatchesLegacyState: "veil_color_mismatches",
}

function collectContext(getTabState: () => TabState): CoverageContext {
  const html = document.documentElement
  const veil = document.getElementById(PREPAINT_VEIL_ID)
  const legacyStyle = document.getElementById(LEGACY_FILTER_STYLE_ID)
  const darkStyle = document.getElementById(DARK_THEME_STYLE_ID)

  return {
    now: Date.now(),
    tabState: getTabState(),
    veilPresent: veil !== null,
    dirtyClassPresent: html.classList.contains(PREPAINT_DIRTY_CLASS),
    darkThemeActive: html.hasAttribute(DARK_THEME_ATTR),
    darkStyleActive: darkStyle?.textContent.includes("--sw-bg-0") ?? false,
    legacyAttrPresent: html.hasAttribute(LEGACY_THEME_ATTR),
    legacyStyleActive: legacyStyle?.textContent.includes("filter:") ?? false,
    veilBackgroundColor:
      veil instanceof HTMLElement
        ? getComputedStyle(veil).backgroundColor
        : null,
  }
}

/**
 * Repair the one coverage gap this watchdog can safely close on its own:
 * `data-sw-dark` (declared, `<html>`, survives a `<head>` swap) still says
 * the static dark-theme layer should be on, but `#__sw_dark_theme` (real,
 * inside `<head>`) is gone — a vendor document flush carried off the
 * stylesheet and left the attribute behind. content.ts still believes dark
 * is required; nothing is currently rendering it. Re-arming the veil closes
 * that window until the next pipeline round (nav-finish, or the Sensor's own
 * reactive rescan) settles a fresh verdict and lifts it again.
 *
 * Deliberately narrower than "any CoverageHeld violation": the same
 * invariant also fires, correctly, whenever `decide()` itself emits
 * `restore-native` (the page reads as already dark, so content.ts's onFire
 * routes an EXONERATED_NATIVE verdict through document-scope.ts's registry
 * custodian, releasing the veil on purpose — SF-BS, #1266) — there both
 * signals go false
 * *together*, `darkThemeActive === darkStyleActive` still holds, and
 * `DarkSignalsAgree` does not fire. Keying the repair off that invariant
 * instead of `CoverageHeld` is what keeps a correct "native already dark,
 * nothing to cover" verdict from being clobbered by a veil that would never
 * come back down.
 *
 * The legacy pair gets no equivalent repair here: `VeilColorMatchesLegacyState`
 * documents why the veil's *color* under legacy is selected from the
 * `data-sw-legacy` attribute alone (prepaint.css's `html[data-sw-legacy]`
 * selector), so re-arming it while that attribute is stale but the filter
 * genuinely isn't running would paint a white veil with no invert() left to
 * composite it back to dark — trading one gap for a literal flash. The dark
 * veil's color has no such dependency, so no equivalent risk exists here.
 */
/** Returns whether it actually re-armed the veil, so a caller whose custody bookkeeping lives outside this module (SF-BS, #1266's `documentScope.reengage()`) knows to reconcile — this call is exactly as much a bypass of the registry as `yt-navigate-start`'s own direct `enablePrepaint()` call, for the same reason. */
function repairDarkDesync(ctx: CoverageContext): boolean {
  if (ctx.tabState !== "auto") return false
  if (!ctx.darkThemeActive || ctx.darkStyleActive) return false
  enablePrepaint()
  return true
}

export function createCoverageWatchdog(
  recorder: CoverageRecorder,
  getTabState: () => TabState,
  /**
   * Called immediately after `repairDarkDesync()` actually re-arms the
   * veil (never on a check that finds nothing to repair). content.ts wires
   * this to `documentScope.reengage()` — a plain idempotency-cache reset is
   * not enough here: it would not invalidate a `resolveCommitted()` call
   * still in flight, which could otherwise complete afterward and tear the
   * veil this repair just put back up right back down (see
   * `document-scope.ts`'s own header), the same bug class
   * `yt-navigate-start` needed the same fix for.
   */
  onVeilRearmed?: () => void
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
    // subtree + characterData: a content-only wipe of an existing extension
    // <style> tag (textContent = "", or a direct Text.data mutation) must be
    // caught here — see this module's header comment for why neither a
    // childList-only observer on <head> itself nor pipeline.ts's Sensor sees
    // it.
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  function check(reason: string): void {
    const ctx = collectContext(getTabState)
    recorder.count("coverage_checks")
    recorder.setSnapshot("coverage", { ...ctx, reason })

    // Fire-and-forget: the check itself must stay synchronous (see this
    // module's header) but recording the outcome need not block it.
    void runInvariants(coverageInvariants, ctx, ctx.now).then((results) => {
      for (const result of results) {
        if (
          result.name === "DarkSignalsAgree" &&
          result.status === "violated"
        ) {
          if (repairDarkDesync(ctx)) {
            onVeilRearmed?.()
          }
        }

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
