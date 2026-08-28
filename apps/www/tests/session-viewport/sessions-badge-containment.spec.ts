/**
 * Regression coverage for #1192: the sessions list row jammed and mashed
 * its badges on a narrow mobile viewport. A longer activity tag (the
 * reported case: `TOPIK Study: Beginner • 15 min`) wrapped its own text
 * *inside* the `rounded-full` pill, rendering as a near-circle rather than
 * a clipped one-line pill - and the row never stacked on mobile, so the
 * action buttons (View summary + copy/delete icons) left the content
 * column almost no room to begin with.
 *
 * Same technique as `no-overflow-scroll.spec.ts` next door and for the same
 * reason: this repo's Playwright suite boots no dev server and no router
 * (see `playwright.config.ts`'s own scope note), and Chromium refuses
 * cross-origin ES module loads from a `file://` origin, so there is no
 * cheap way to mount the real routed `SessionsRoute` here. Instead this
 * mirrors, as static HTML/CSS, the exact class list shipped in:
 *   - apps/www/src/routes/_dashboard/sessions/index.tsx (`SessionCard`)
 *   - packages/ui/shared/src/components/ui/badge.tsx
 *   - packages/ui/shared/src/components/ui/button.tsx
 * at two points in #1192's history - `BEFORE` (main@45e947d, the exact
 * code the report was filed against) and `AFTER` (the current fix) - so
 * the assertions are pinned against a fixture known to reproduce the real
 * regression, not a synthetic one.
 *
 * This is also the concrete demonstration for why #1192's review asked for
 * a *geometry-invariant* layer and not just a screenshot diff: the bug here
 * is invisible to both `expectNoHorizontalOverflow` and
 * `expectContainedLayouts` (see the `BEFORE` assertions below - both pass)
 * because wrapped text that still fits inside its box never overflows or
 * escapes anything. It only shows up as `expectSingleLineText` failing -
 * the badge's own promise ("this is a one-line pill") breaking while every
 * containment invariant stays green.
 */

import { expect, test, type Page } from "@playwright/test"

import {
  countTextLines,
  expectContainedLayouts,
  expectNoHorizontalOverflow,
  MOBILE_WIDTHS,
} from "@tests/layout-invariants/geometry"
import { BOUNDED_STRESS_LABELS } from "@tests/layout-invariants/stress-content"

/**
 * `docs/session-viewport/05-the-mobile-shell.md` validates this codebase's
 * mobile shell at 390×800 and `tests/ui-fit/harness.ts`'s own "phone"
 * profile is 390, not 320 - this repo has never committed to a 320px
 * floor. So this spec sweeps the widths at and above that floor
 * (`MOBILE_WIDTHS` minus 320) rather than the full matrix; 320px is left to
 * whichever spec first commits to supporting it.
 */
const TESTED_WIDTHS = MOBILE_WIDTHS.filter(({ width }) => width >= 360)

type ShellVariant = "before" | "after"

const SHARED_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: sans-serif; background: #f5f0e8; }
  /* mirrors the dashboard shell's outlet div (routes/_dashboard.tsx): p-6 */
  .page { padding: 24px; }
  /* mirrors the route's own wrapper: max-w-3xl space-y-8 */
  .container { max-width: 48rem; }
  /* mirrors Card: rounded-xl border shadow */
  .card { border: 1px solid #ccc; border-radius: 0.75rem; background: #fff; }
  /* mirrors Badge's shared base (packages/ui/shared/.../badge.tsx) - identical
     in both variants, since #1192 reverted whitespace-nowrap out of the base
     and scoped it to the two call sites instead */
  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 9999px;
    border: 1px solid #ccc;
    padding: 0.125rem 0.625rem;
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 600;
  }
  /* the AFTER-only className="whitespace-nowrap" on the two sessions-route
     Badge call sites (status pill, activity summary pill) */
  .badge-nowrap { white-space: nowrap; }
  .name-row { display: flex; align-items: center; gap: 0.5rem; }
  .name {
    margin: 0;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .activities-row {
    margin-top: 0.25rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .updated { margin: 0.25rem 0 0; font-size: 0.75rem; line-height: 1rem; color: #666; }
  .content { min-width: 0; flex: 1 1 0%; }
  /* mirrors Button's base + size="sm" */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
    height: 2.25rem;
    padding: 0 0.75rem;
    border: 1px solid #ccc;
    background: #fff;
  }
  .btn-icon { border: none; background: transparent; }
  .btn-icon .glyph { display: inline-block; width: 0.875rem; height: 0.875rem; }
`

function beforeCss(): string {
  return `
    /* mirrors CardContent merged: "flex items-center justify-between gap-4 py-4" */
    .card-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.5rem;
    }
    .checkbox { width: 1rem; height: 1rem; flex-shrink: 0; }
    .actions { display: flex; flex-shrink: 0; align-items: center; gap: 0.5rem; }
  `
}

function afterCss(): string {
  return `
    /* mirrors CardContent merged:
       "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4" */
    .card-content {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
    }
    /* mirrors the new wrapper div: "flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center" */
    .left-wrap { display: flex; min-width: 0; align-items: flex-start; gap: 0.75rem; }
    .checkbox { width: 1rem; height: 1rem; flex-shrink: 0; margin-top: 0.25rem; }
    /* mirrors "flex shrink-0 items-center gap-2 self-end sm:self-auto" */
    .actions {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 0.5rem;
      align-self: flex-end;
    }
    @media (min-width: 640px) {
      .card-content { flex-direction: row; align-items: center; justify-content: space-between; gap: 1rem; }
      .left-wrap { flex: 1 1 0%; align-items: center; }
      .checkbox { margin-top: 0; }
      .actions { align-self: auto; }
    }
  `
}

function actionsHtml(): string {
  return `
    <div class="actions">
      <button class="btn">View summary</button>
      <button class="btn btn-icon" title="Duplicate"><span class="glyph"></span></button>
      <button class="btn btn-icon" title="Delete"><span class="glyph"></span></button>
    </div>
  `
}

function contentHtml(activityLabel: string, badgeClass: string): string {
  return `
    <div class="content">
      <div class="name-row">
        <p class="name">Vocabulary warm-up</p>
        <span class="badge ${badgeClass}">Completed</span>
      </div>
      <div class="activities-row">
        <span class="badge ${badgeClass}" id="activity-badge">${activityLabel}</span>
      </div>
      <p class="updated">Updated 1 day ago</p>
    </div>
  `
}

function shellHtml(variant: ShellVariant, activityLabel: string): string {
  const badgeClass = variant === "after" ? "badge-nowrap" : ""
  const variantCss = variant === "after" ? afterCss() : beforeCss()

  const body =
    variant === "after"
      ? `
        <div class="left-wrap">
          <input class="checkbox" type="checkbox">
          ${contentHtml(activityLabel, badgeClass)}
        </div>
        ${actionsHtml()}
      `
      : `
        <input class="checkbox" type="checkbox">
        ${contentHtml(activityLabel, badgeClass)}
        ${actionsHtml()}
      `

  return `<!DOCTYPE html>
<html>
<head>
<style>${SHARED_CSS}${variantCss}</style>
</head>
<body>
  <div class="page">
    <div class="container">
      <!-- data-layout-contained: the Card promises to own everything inside it -->
      <div class="card" data-layout-contained>
        <div class="card-content">
          ${body}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

async function loadShell(
  page: Page,
  variant: ShellVariant,
  activityLabel: string
): Promise<void> {
  await page.route("**/*", (route) =>
    route.fulfill({
      body: shellHtml(variant, activityLabel),
      contentType: "text/html",
    })
  )
  await page.goto(
    `https://localhost/__sessions-badge-containment-regression__/${variant}`
  )
}

test.describe("sessions list row never wraps a badge's text inside itself", () => {
  for (const { name, width } of TESTED_WIDTHS) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: 800 } })

      test(`after #1192: every stress label stays on one line (${name})`, async ({
        page,
      }) => {
        for (const label of BOUNDED_STRESS_LABELS) {
          await loadShell(page, "after", label)

          const [lineCount] = await countTextLines(page, "#activity-badge")

          expect(
            lineCount,
            `"${label}" wrapped onto ${lineCount} lines at ${width}px`
          ).toBeLessThanOrEqual(1)

          // The harness's other two invariants stay green throughout - this
          // fix didn't trade one geometry problem for another.
          await expectNoHorizontalOverflow(page)
          await expectContainedLayouts(page)
        }
      })
    })
  }

  test("before #1192 (sanity): the reported label wraps inside the pill, not the row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    const reportedLabel = "TOPIK Study: Beginner • 15 min"
    await loadShell(page, "before", reportedLabel)

    const [lineCount] = await countTextLines(page, "#activity-badge")

    // Proves the fixture reproduces the real regression: without the fix,
    // the pill's own text wraps across multiple lines.
    expect(
      lineCount,
      "fixture did not reproduce the reported wrap - it no longer proves anything"
    ).toBeGreaterThan(1)

    // And proves *why* a plain overflow/containment sweep alone would have
    // missed this bug in review: wrapped text that still fits inside its
    // box escapes neither the viewport nor the card. Both invariants pass
    // even on the known-broken fixture.
    await expectNoHorizontalOverflow(page)
    await expectContainedLayouts(page)
  })
})
