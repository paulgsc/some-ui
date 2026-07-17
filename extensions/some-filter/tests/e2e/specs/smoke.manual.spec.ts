/**
 * smoke.manual.spec.ts — pre-release smoke check, NOT a CI gate.
 *
 * Why this exists:
 *   This extension's classify-on-refresh pipeline depends on a property
 *   vitest/jsdom cannot observe at all: whether Chrome's real MV3
 *   content-script CSS injection actually lands in the page's cascade, and
 *   how fast. (It is NOT whether the injected stylesheet becomes
 *   enumerable in document.styleSheets — a full investigation established
 *   that it never does, on this browser/config, regardless of how long you
 *   wait. That finding is recorded in prepaint.ts's doc comments and is not
 *   re-tested here; it's now a closed fact baked into how
 *   withPrepaintSuppressed() works, not an open question.)
 *
 *   jsdom has no real CSS engine and no frame-scheduled style recalc, so it
 *   structurally cannot catch a regression where, say, a manifest edit or a
 *   Vite build-config change breaks real CSS injection while every unit
 *   test stays green. That exact failure mode is what caused this bug to
 *   exist undetected in the first place — the old jsdom-mocked sheet tests
 *   passed the entire time the real extension was broken.
 *
 * Why this is NOT in CI:
 *   This suite requires a non-headless Chromium launch via
 *   launchPersistentContext + --load-extension, gated behind the
 *   `nix develop .#playwright` shell. That is not portable to a CI runner
 *   as currently configured, and no attempt has been made to make it so.
 *   This file is excluded from playwright.config.ts's testMatch (see the
 *   .manual.spec.ts naming convention) and must be run by hand:
 *
 *     nix develop .#playwright
 *     pnpm build:chromium
 *     pnpm exec playwright test smoke.manual
 *
 * When to run this:
 *   Before cutting a release build, and after any change to:
 *     - public/manifest.json (content_scripts entries, run_at, matches)
 *     - public/prepaint.css (especially the --sw-prepaint-sheet sentinel
 *       or anything the html[data-sw-prepaint] selector gates)
 *     - vite.config.ts (build input/output, public-dir copy behavior)
 *   Not meant to run on every commit. Not meant to be the only safety net —
 *   classify.test.ts, dark-theme.test.ts, and prepaint.test.ts (all plain
 *   vitest, no browser, fully CI-portable) remain the primary regression
 *   gates for the LOGIC this pipeline depends on. This file only covers the
 *   one seam those tests structurally cannot reach: real browser injection.
 *
 * What was deliberately deleted to get to this minimal version:
 *   The original triage suite (Q1-Q4 decision tree, document.styleSheets
 *   polling probes, window-global diagnostics, realm-visibility workarounds)
 *   was investigation tooling built to find an unknown root cause. The root
 *   cause is now known and fixed. Re-running that decision tree on every
 *   future change would mean asserting on internal mechanism details
 *   (sheet enumeration, capture attempt counts) that are no longer part of
 *   the implementation at all — it would not protect against regressions,
 *   it would just be a maintenance tax with no corresponding signal. This
 *   file keeps only the one outcome-level claim worth re-checking by hand.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"

test.describe("pre-release smoke check (manual only — see file header)", () => {
  test("cold load on a light page: dark theme applies, veil drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)
    expect(snap.hasPrepaintVeil).toBe(false)
  })

  test("cold load on a dark page: theme does not apply, veil still drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("none")
    expect(snap.hasDarkAttr).toBe(false)
    expect(snap.hasPrepaintVeil).toBe(false)
  })
})
