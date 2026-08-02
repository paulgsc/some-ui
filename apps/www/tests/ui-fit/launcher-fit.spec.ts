/**
 * Does the activity quick launch fit its box as the catalogue grows? (#853,
 * promoted to enforcement by #858.)
 *
 * Two halves, and both matter:
 *
 *   1. **Characterization.** The `catalogue` fixture reproduces what `/app`
 *      shipped before #852 - `ACTIVITY_IDS.map` into a fixed grid - and this
 *      spec asserts it *fails* at N = 20 and N = 50. That is the claim the
 *      whole epic was designed against, and it was an inference until this
 *      file existed. It is pinned rather than deleted for the same reason the
 *      session-viewport spec pins its BEFORE shell: an AFTER assertion that
 *      has never been seen to go red proves nothing.
 *   2. **Enforcement.** The `recommended` and `paged` fixtures are the shape
 *      that shipped, and they must fit at every N under test. Reverting #854
 *      (rendering the whole catalogue again) turns the first half green and
 *      the second half red - which is the guardrail #858 asks for.
 *
 * ## Why a static fixture rather than the running app
 *
 * Same reason as tests/session-viewport/no-overflow-scroll.spec.ts, which
 * this follows: no dev server, no router, no query client, no tenant storage
 * to seed. What is being measured is a layout question, and the layout is
 * CSS. The cost is that the CSS below is a *mirror* of the shipped classes
 * and can drift from them - so the two things most likely to drift are
 * imported from the package instead of copied:
 *
 *   - `recommendedCount` - the same function the launcher calls for `k`.
 *   - `syntheticCatalogue` - the same fixture the unit tests rank and search.
 *
 * If the mirror below stops resembling the app, this spec goes green while
 * `/app` breaks. The check that cannot drift is the Storybook sweep next
 * door; it covers `packages/**` and `extensions/**`, and `apps/www` has no
 * stories for it to see. Widening those globs is the follow-up, not this
 * story.
 */

import { expect, test, type Page } from "@playwright/test"
import { recommendedCount, syntheticCatalogue } from "@some-ui/activity-catalog"

/**
 * The same three sizes the Storybook sweep uses, for the same reasons: the
 * shortest viewport a laptop realistically presents, a narrow phone, and a
 * large desktop.
 */
const VIEWPORTS = [
  { name: "short-laptop", width: 1280, height: 560 },
  { name: "phone", width: 390, height: 720 },
  { name: "desktop", width: 1680, height: 1050 },
] as const

/** Today's happy path, and three futures. Mirrors CHARACTERIZATION_SIZES. */
const SIZES = [4, 10, 20, 50] as const

/**
 * Mirrors the shipped chain, class for class:
 *   - routes/_dashboard.tsx      `flex-1 p-6 overflow-auto` around the outlet
 *   - routes/_dashboard/app.tsx  `mx-auto max-w-5xl space-y-8`
 *   - Card / CardContent         `rounded-xl border shadow` / `p-6`
 *   - ActivityLauncher's grid    `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`
 *
 * The pre-#852 grid was `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`, which is
 * what `catalogue` renders.
 */
const SHELL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: 16rem; border-right: 1px solid #e5e7eb; }
  main { margin-left: 16rem; display: flex; flex-direction: column; min-height: 100svh; }
  /* SidebarProvider takes the rail off-canvas below md - the phone viewport
     gets the full width, as it does in the app. */
  @media (max-width: 767px) { .sidebar { display: none; } main { margin-left: 0; } }
  header { height: 3.5rem; flex-shrink: 0; border-bottom: 1px solid #e5e7eb; }
  .outlet { flex: 1 1 0%; padding: 1.5rem; }
  .page { margin: 0 auto; max-width: 64rem; display: flex; flex-direction: column; gap: 2rem; }
  section { display: flex; flex-direction: column; gap: .75rem; }
  h2 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .field { height: 2.5rem; border: 1px solid #e5e7eb; border-radius: .375rem; }
  .card { border: 1px solid #e5e7eb; border-radius: .75rem; }
  .card-content { padding: 1.5rem; display: flex; flex-direction: column; gap: .5rem; }
  .card-content .name { font-weight: 600; }
  .card-content .description { font-size: .875rem; color: #6b7280; }
  .card-content .hint { font-size: .75rem; color: #6b7280; }
  .profile { border: 1px solid #e5e7eb; border-radius: .75rem; height: 6.5rem; }
  .session-row { border: 1px solid #e5e7eb; border-radius: .75rem; height: 4.5rem; }
  .sessions { display: flex; flex-direction: column; gap: .5rem; }
  .grid { display: grid; gap: .75rem; align-content: start; }
  .pager { height: 2.25rem; flex-shrink: 0; }
  /* the composer picker's bounded box: h-72 sm:h-80 */
  .picker-box { height: 18rem; }
  @media (min-width: 640px) { .picker-box { height: 20rem; } }
`

/** `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` - what the launcher ships. */
const LAUNCHER_GRID_CSS = `
  .launcher-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 640px) { .launcher-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 1024px) { .launcher-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
`

/** `sm:grid-cols-2 lg:grid-cols-4` - what it shipped before #852. */
const LEGACY_GRID_CSS = `
  .launcher-grid { grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 640px) { .launcher-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1024px) { .launcher-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
`

/** `grid gap-3 sm:grid-cols-2` - the composer picker, both before and after. */
const PICKER_GRID_CSS = `
  .picker-grid { grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 640px) { .picker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function launchCard(name: string, description: string): string {
  return `<div class="card"><div class="card-content">
    <div class="row"><span>◆</span><span></span></div>
    <p class="name">${escapeHtml(name)}</p>
    <p class="description">${escapeHtml(description)}</p>
    <p class="hint">Reads prompts aloud</p>
  </div></div>`
}

type LauncherVariant = "catalogue" | "recommended"

/**
 * The dashboard at catalogue size `size`.
 *
 * `catalogue` renders all of them, which is what shipped before #852.
 * `recommended` renders `recommendedCount(width)` of them, which is what
 * ships now - and the count comes from the package, so a change to `k` moves
 * this fixture with it rather than leaving it measuring last month's layout.
 */
function launcherHtml(
  size: number,
  variant: LauncherVariant,
  width: number
): string {
  const catalogue = syntheticCatalogue(size)
  const shown =
    variant === "catalogue"
      ? catalogue
      : catalogue.slice(0, recommendedCount(width))

  const cards = shown
    .map((activity) => launchCard(activity.name, activity.description))
    .join("")

  return `<!DOCTYPE html><html><head><style>
    ${SHELL_CSS}
    ${variant === "catalogue" ? LEGACY_GRID_CSS : LAUNCHER_GRID_CSS}
  </style></head><body>
    <div class="sidebar"></div>
    <main>
      <header></header>
      <div class="outlet">
        <div class="page">
          <div class="profile"></div>
          <section id="launcher">
            <div class="row"><h2>Start something new</h2><span>Browse all</span></div>
            ${variant === "recommended" ? '<div class="field"></div>' : ""}
            <div class="grid launcher-grid" id="launcher-grid">${cards}</div>
          </section>
          <section>
            <div class="row"><h2 id="recent-heading">Recent sessions</h2><span>View all</span></div>
            <div class="sessions">
              ${'<div class="session-row"></div>'.repeat(5)}
            </div>
          </section>
        </div>
      </div>
    </main>
  </body></html>`
}

type PickerVariant = "catalogue" | "paged"

/**
 * The composer's step 1 at catalogue size `size`.
 *
 * `paged` mirrors the bounded box the fitted pager measures. The pager's own
 * arithmetic is unit-tested in `packages/utils`; what is checked here is that
 * the box it is measured against is genuinely bounded, so paging has
 * something to converge on.
 */
function pickerHtml(size: number, variant: PickerVariant): string {
  const catalogue = syntheticCatalogue(size)
  // Two rows of the bounded box at its smallest - what the fitted pager
  // converges on for a card of this height.
  const shown = variant === "catalogue" ? catalogue : catalogue.slice(0, 4)

  const cards = shown
    .map((activity) => launchCard(activity.name, activity.description))
    .join("")

  const grid = `<div class="grid picker-grid">${cards}</div>`

  return `<!DOCTYPE html><html><head><style>
    ${SHELL_CSS}
    ${PICKER_GRID_CSS}
  </style></head><body>
    <div class="sidebar"></div>
    <main>
      <header></header>
      <div class="outlet">
        <div class="page">
          <section>
            <div class="row"><h2>Choose activities</h2></div>
            <div class="field"></div>
            ${variant === "paged" ? `<div class="picker-box">${grid}</div><div class="pager" id="picker-end"></div>` : `${grid}<div class="pager" id="picker-end"></div>`}
          </section>
        </div>
      </div>
    </main>
  </body></html>`
}

type LauncherMetrics = {
  /** The whole "Start something new" section, chrome included. */
  sectionHeight: number
  /** Where the next section begins, relative to the fold. Negative is visible. */
  recentHeadingBelowFoldBy: number
}

/**
 * What the launcher costs the page.
 *
 * Not "does the document scroll": `/app` is not a bounded viewport route -
 * `routes/_dashboard.tsx` hands it `overflow-auto` on purpose - and a
 * dashboard carrying a profile card, a launcher and five recent sessions has
 * always been taller than a 560px window. Asserting the whole document fits
 * would fail for a reason this epic is not about, and would go on failing
 * after it was fixed.
 *
 * What #852 claims is narrower and checkable: the launcher grows with the
 * catalogue until it *pushes everything below it* off the first screen. The
 * invariant that kills that is stronger than any absolute pixel budget, and
 * it survives a redesign of everything around it:
 *
 *   **the launcher's footprint does not depend on N.**
 *
 * So both numbers are measured against the N = 4 baseline rather than
 * against a constant. A launcher that renders `k` is flat in N; one that
 * renders the catalogue is linear in it, and no amount of tuning the rest of
 * the page hides the difference.
 */
async function launcherMetrics(
  page: Page,
  html: string
): Promise<LauncherMetrics> {
  await page.setContent(html, { waitUntil: "load" })
  return page.evaluate(() => {
    const section = document.querySelector("#launcher")
    const heading = document.querySelector("#recent-heading")
    if (!section || !heading) throw new Error("fixture is missing a landmark")
    const fold = document.documentElement.clientHeight
    return {
      sectionHeight: section.getBoundingClientRect().height,
      recentHeadingBelowFoldBy: heading.getBoundingClientRect().top - fold,
    }
  })
}

type FirstScreen = {
  /** How far below the fold the landmark sits. Negative means it is visible. */
  belowFoldBy: number
  offFirstScreen: boolean
}

/**
 * The picker's equivalent, and an absolute one rather than a relative one.
 *
 * The composer's step 1 is a smaller page than the dashboard - a heading, a
 * field, the grid - so "the whole step is on screen" is a budget it can
 * actually meet, and meeting it is the point of bounding the grid.
 */
async function firstScreen(
  page: Page,
  html: string,
  selector: string
): Promise<FirstScreen> {
  await page.setContent(html, { waitUntil: "load" })
  return page.evaluate((target: string) => {
    const element = document.querySelector(target)
    if (!element) throw new Error(`fixture is missing ${target}`)
    const fold = document.documentElement.clientHeight
    const belowFoldBy = element.getBoundingClientRect().top - fold
    return { belowFoldBy, offFirstScreen: belowFoldBy > 0 }
  }, selector)
}

/** Sub-pixel layout noise, not a regression. */
const TOLERANCE_PX = 2

test.describe("the launcher's footprint does not depend on the catalogue size", () => {
  /**
   * The characterization (#853), kept as the guardrail's teeth (#858).
   *
   * Reverting #854 - rendering the whole catalogue again - makes this block
   * pass and the enforcement block below fail, and that pair is what has to
   * hold for either to mean anything. An AFTER assertion that has never been
   * seen to go red proves nothing.
   */
  for (const size of [20, 50] as const) {
    test(`rendering the whole catalogue at N = ${size} grows the launcher and buries what follows`, async ({
      page,
    }) => {
      const viewport = VIEWPORTS[0]
      await page.setViewportSize(viewport)

      const baseline = await launcherMetrics(
        page,
        launcherHtml(4, "catalogue", viewport.width)
      )
      const grown = await launcherMetrics(
        page,
        launcherHtml(size, "catalogue", viewport.width)
      )

      expect(
        grown.sectionHeight,
        `At N = ${size} the pre-#852 launcher was expected to be several times ` +
          `taller than at N = 4 (${Math.round(baseline.sectionHeight)}px), and was ` +
          `${Math.round(grown.sectionHeight)}px. Either this fixture no longer ` +
          `mirrors what shipped, or the dashboard shell changed - check that ` +
          `before trusting the enforcement cases below.`
      ).toBeGreaterThan(baseline.sectionHeight * 3)

      expect(
        grown.recentHeadingBelowFoldBy,
        `At N = ${size} "Recent sessions" was expected to be pushed well below ` +
          `the fold, and sat ${Math.round(grown.recentHeadingBelowFoldBy)}px from it.`
      ).toBeGreaterThan(baseline.recentHeadingBelowFoldBy + 200)
    })
  }

  for (const viewport of VIEWPORTS) {
    for (const size of [10, 20, 50] as const) {
      test(`k recommended costs the same at N = ${size} as at N = 4 on ${viewport.name}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)

        const baseline = await launcherMetrics(
          page,
          launcherHtml(4, "recommended", viewport.width)
        )
        const grown = await launcherMetrics(
          page,
          launcherHtml(size, "recommended", viewport.width)
        )

        const failure =
          `The launcher grew from ${Math.round(baseline.sectionHeight)}px at N = 4 ` +
          `to ${Math.round(grown.sectionHeight)}px at N = ${size} on ${viewport.name}, ` +
          `pushing "Recent sessions" ` +
          `${Math.round(grown.recentHeadingBelowFoldBy - baseline.recentHeadingBelowFoldBy)}px ` +
          `further down.\n` +
          `The launcher must render k, not N, at every catalogue size. Page it ` +
          `(useFittedPage), rank it (pickRecommended), or search it ` +
          `(searchActivities) - handing the remainder to a scrollbar is the one ` +
          `answer this repo does not take. See docs/ui-fit/README.md.`

        expect(grown.sectionHeight, failure).toBeLessThanOrEqual(
          baseline.sectionHeight + TOLERANCE_PX
        )
        expect(grown.recentHeadingBelowFoldBy, failure).toBeLessThanOrEqual(
          baseline.recentHeadingBelowFoldBy + TOLERANCE_PX
        )
      })
    }
  }

  for (const viewport of VIEWPORTS) {
    test(`k recommended is exactly one row on ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.setContent(launcherHtml(50, "recommended", viewport.width), {
        waitUntil: "load",
      })

      const grid = await page.evaluate(() => {
        const element = document.querySelector("#launcher-grid")
        if (!element) throw new Error("fixture is missing #launcher-grid")
        const tops = new Set(
          Array.from(element.children).map((child) =>
            Math.round(child.getBoundingClientRect().top)
          )
        )
        return { rowCount: tops.size, cardCount: element.children.length }
      })

      expect(grid.cardCount).toBe(recommendedCount(viewport.width))
      expect(
        grid.rowCount,
        `k is chosen so the recommended set is one row at every breakpoint, ` +
          `and it wrapped to ${grid.rowCount} rows on ${viewport.name}. Either k or ` +
          `the grid's column count moved without the other - they live next to ` +
          `each other in packages/activity-catalog/src/lib/fit.ts for that reason.`
      ).toBe(1)
    })
  }
})

test.describe("the composer's picker fits its step as N grows", () => {
  for (const size of [20, 50] as const) {
    test(`rendering the whole catalogue at N = ${size} runs the step off the screen`, async ({
      page,
    }) => {
      const viewport = VIEWPORTS[0]
      await page.setViewportSize(viewport)

      const { belowFoldBy, offFirstScreen } = await firstScreen(
        page,
        pickerHtml(size, "catalogue"),
        "#picker-end"
      )

      expect(
        offFirstScreen,
        `At N = ${size} the unpaged picker was expected to run past the fold ` +
          `and did not (${Math.round(belowFoldBy)}px).`
      ).toBe(true)
    })
  }

  for (const viewport of VIEWPORTS) {
    for (const size of SIZES) {
      test(`the paged picker fits ${viewport.name} at N = ${size}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)

        const { belowFoldBy, offFirstScreen } = await firstScreen(
          page,
          pickerHtml(size, "paged"),
          "#picker-end"
        )

        expect(
          offFirstScreen,
          `The composer's picker ran ${Math.round(belowFoldBy)}px past the fold at ` +
            `N = ${size} on ${viewport.name}. The catalogue grid is bounded and ` +
            `paged (useFittedPage + PageControls); if a card grew, the box has to ` +
            `grow with it or the pager has to give one back.`
        ).toBe(false)
      })
    }
  }
})
