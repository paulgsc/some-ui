/**
 * Does every panel fit the rect the session viewport grants it? (#899.)
 *
 * ## The gap this closes
 *
 * A component rendered on its own has no host, so `h-full` resolves against
 * `auto`, the content sets its own height, and "content fits its box" is
 * vacuously true because there is no box. That makes a plain render blind to
 * the whole class of failure #899 reported. The same component in
 * `/sessions/$id` is handed a leaf rect of a few hundred pixels and paints the
 * rest of itself over whatever the layout put below it - which is exactly
 * what the screenshot on #899 shows the TOPIK quiz summary doing.
 *
 * Stated as an invariant rather than a symptom:
 *
 * > A panel's size is granted by the layout at the boundary that binds it -
 * > `componentRegistry` key to leaf rect. Nothing the panel renders may paint
 * > outside that rect. Content that wants more space negotiates for it
 * > (docs/ui-fit's ladder), or declares the escape.
 *
 * The registry *is* that boundary: a key there is a delegation of size
 * authority across a workspace edge, which is why the coverage map below is
 * keyed by `RegistryKey`. Adding a panel without a fixture is then a type
 * error, not an omission nobody notices.
 *
 * ## How the rect is granted
 *
 * The panel page (`./panel-page`) mounts one fixture per load inside a rect
 * shaped the way `RenderSolved` shapes a leaf: an `absolute` box that clips,
 * and a full-size box inside it (`data-fit-slot`) that the panel fills. It is
 * built with www's own Vite config and stylesheets, so the CSS measured here
 * is the CSS the app ships (docs/ui-fit, 2c). Overflow is
 * measured from the slot with `getBoundingClientRect` and `scrollHeight`, both
 * of which report where content *would* paint, so the leaf's clipping cannot
 * hide a regression from this sweep the way it hides it from the eye.
 *
 * Run against a built panel page:
 *
 *   pnpm --filter www build:fit
 *   pnpm --filter www test:ui-fit
 *
 * Skips itself with a clear message when no build is found, except under CI,
 * where it fails instead. It also fails rather than passes when a panel
 * renders nothing - a sweep that measures an empty root and reports success
 * is worse than no sweep.
 */

import { expect, test, type Page } from "@playwright/test"
import type { RegistryKey } from "@some-ui/content-registry"

import {
  PANEL_PAGE_BUILD,
  PANEL_PAGE_PATH,
  panelPageBuilt,
  serve,
  VIEWPORTS,
  type StaticSite,
} from "./harness"
import type { PanelId } from "./panel-page/fixtures"

/**
 * How this sweep sees a panel. Three states, and two of them are debt:
 *
 *   `panel`    swept and held to the invariant.
 *   `debt`     swept, known not to fit, with the reason. Reported rather than
 *              failed - and the sweep asserts it *still* overflows, so an
 *              entry cannot quietly rot after someone fixes the panel.
 *   `unswept`  no fixture mounts this component at all, so there is nothing to
 *              measure. The weakest state, and the one to argue down first.
 *
 * Every entry that is not a plain `panel` is an admission, not a category.
 */
type PanelCoverage =
  | { panel: PanelId }
  | { panel: PanelId; debt: string }
  | { unswept: string }

/**
 * Every registry key, and where this sweep sees it. `Record<RegistryKey, …>`
 * is load-bearing: a new panel in `componentRegistry` fails `tsc` here until
 * someone says how it gets fitted. `PanelId` is too: a fixture renamed or
 * removed in `./panel-page/fixtures.tsx` fails `tsc` here, not the sweep.
 */
const PANELS: Record<RegistryKey, PanelCoverage> = {
  hangul: { panel: "hangul" },
  leetype: { panel: "leetype" },
  topik: { panel: "topik" },
}

/**
 * Stages a panel passes through that the panel alone never reaches. The
 * TOPIK applet only shows its summary after ten answers, so a fixture that
 * mounts the applet renders the one stage that always fitted - which is how
 * #899 shipped. Each stage here is its own fixture, swept as its own panel.
 */
const PANEL_STAGES: ReadonlyArray<PanelId> = [
  "topik-quiz-idle-playing",
  "topik-quiz-active-multiple-choice",
  "topik-quiz-active-text-input",
  "topik-quiz-feedback-incorrect-text-input",
  "topik-quiz-summary-advanced",
  "topik-quiz-summary-failed",
]

const PLANTED_OVERFLOW: PanelId = "planted-overflow"

/**
 * Deliberate escapes, matched against `data-fit-intent` on the element or any
 * ancestor. Same shape as the sweep's scroll intents, for the same reason: an
 * opt-out should be a greppable act in the component, not a class name that
 * happens to look intentional.
 */
const ALLOWED_FIT_INTENTS = new Set([
  // A marquee's whole mechanic is translating a track wider than its window.
  "marquee",
  // Decorative motion (particles, glows) that is clipped by design.
  "ambient",
])

/**
 * One way a panel can break the contract, in the terms the fix is written in.
 *
 *   `escape` the element paints outside the granted rect. A panel asking for
 *           more than it was given - `min-h-screen` on a panel root, a row of
 *           chips that will not wrap.
 *   `leak`  a box with a definite size holds content it cannot contain and
 *           does not clip it, so the excess paints over whatever the layout
 *           put next to it. This is #899 exactly: the quiz summary's card was
 *           `h-full` around 950px of content, and the difference landed on the
 *           panel below. A box that sizes to its content cannot leak - its
 *           `scrollHeight` and `clientHeight` are equal - so this only ever
 *           fires where something really did assert a size.
 */
type Violation = {
  kind: "escape" | "leak"
  tag: string
  classes: string
  overY: number
  overX: number
}

/** Everything the panel does that its rect does not permit, worst first. */
async function findViolations(
  page: Page,
  allowedIntents: ReadonlyArray<string>
): Promise<{ mounted: boolean; violations: Array<Violation> }> {
  return page.evaluate(
    (allowed: Array<string>) => {
      const intents = new Set(allowed)
      const root = document.querySelector("[data-fit-slot]")
      if (!root || root.childElementCount === 0) {
        return { mounted: false, violations: [] }
      }

      const rect = root.getBoundingClientRect()
      const violations: Array<Violation> = []
      const isClipping = (style: CSSStyleDeclaration): boolean =>
        style.overflowX !== "visible" || style.overflowY !== "visible"

      for (const element of Array.from(
        root.querySelectorAll<HTMLElement>("*")
      )) {
        // SVG internals are geometry, not layout - a path's bounding box says
        // nothing about whether the chart drawn from it fits.
        if (element.closest("svg")) continue

        const style = getComputedStyle(element)
        // The overlay plane (toasts, popovers, dialogs) is not part of the
        // layout tree the viewport tiles - see docs/session-viewport.
        if (style.position === "fixed") continue
        // Nothing that paints nothing can overflow: a hover tooltip parked
        // outside the panel at `opacity: 0` is not content spilling out.
        if (
          !element.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            contentVisibilityAuto: true,
          })
        ) {
          continue
        }

        const declared = element.closest("[data-fit-intent]")
        const intent = declared?.getAttribute("data-fit-intent") ?? null
        if (intent !== null && intents.has(intent)) continue

        const tag = element.tagName.toLowerCase()
        const classes = element.className.toString().slice(0, 120)
        const box = element.getBoundingClientRect()

        // A box that clips or scrolls has resolved its own overflow; what
        // matters then is whether *it* fits, which is measured on its own turn.
        if (!isClipping(style) && element.clientHeight > 0) {
          const overY = element.scrollHeight - element.clientHeight
          const overX = element.scrollWidth - element.clientWidth
          if (overY > 2 || overX > 2) {
            violations.push({ kind: "leak", tag, classes, overY, overX })
            continue
          }
        }

        if (box.width === 0 || box.height === 0) continue

        // Content inside a clipping or scrolling ancestor cannot paint outside
        // the rect however long it is - the ancestor is the one on the hook.
        let clipped = false
        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== root;
          ancestor = ancestor.parentElement
        ) {
          if (isClipping(getComputedStyle(ancestor))) {
            clipped = true
            break
          }
        }
        if (clipped) continue

        const overY = Math.round(box.bottom - rect.bottom)
        const overX = Math.round(box.right - rect.right)
        // Sub-pixel rounding at fractional zoom is not an overflow.
        if (overY <= 2 && overX <= 2) continue

        violations.push({ kind: "escape", tag, classes, overY, overX })
      }

      violations.sort(
        (a, b) => Math.max(b.overY, b.overX) - Math.max(a.overY, a.overX)
      )
      return { mounted: true, violations: violations.slice(0, 3) }
    },
    [...allowedIntents]
  )
}

type SweptPanel = { label: string; panel: PanelId; debt: string | null }

/** One violation, said in the terms of the fix rather than the measurement. */
function describe(panel: SweptPanel, violation: Violation): string {
  const where = `${panel.label} (${panel.panel}): <${violation.tag}>`
  const classes = `classes: ${violation.classes}`

  if (violation.kind === "leak") {
    return (
      `${where} holds ${violation.overY}px more content than its own height ` +
      `(and ${violation.overX}px more than its width) and does not clip it, ` +
      `so the excess paints over whatever is laid out next to it. Fit the ` +
      `content to the box — tabs, a measured page, a smaller surface ` +
      `(docs/ui-fit) — or, if the scroll is the interaction, declare it with ` +
      `data-scroll-intent. ${classes}`
    )
  }

  return (
    `${where} paints ${violation.overY}px below / ${violation.overX}px right ` +
    `of the granted rect — the panel is asking for more room than the layout ` +
    `gave it. Take the rect as given (no min-h-screen on a panel root; wrap ` +
    `rows that cannot fit), or declare the escape with data-fit-intent. ` +
    `${classes}`
  )
}

const SWEPT: ReadonlyArray<SweptPanel> = [
  ...Object.entries(PANELS).flatMap(
    ([key, coverage]): Array<SweptPanel> =>
      "panel" in coverage
        ? [
            {
              label: key,
              panel: coverage.panel,
              debt: "debt" in coverage ? coverage.debt : null,
            },
          ]
        : []
  ),
  ...PANEL_STAGES.map((panel) => ({ label: panel, panel, debt: null })),
]

const BUILT = panelPageBuilt()

let site: StaticSite | null = null

/**
 * Mount one panel in its granted rect and measure what leaves it. `errors`
 * carries anything the page threw, so a panel that renders nothing says why.
 */
async function measure(
  page: Page,
  panel: PanelId
): Promise<{
  mounted: boolean
  violations: Array<Violation>
  errors: Array<string>
}> {
  const errors: Array<string> = []
  const onError = (error: Error): void => {
    errors.push(error.message)
  }
  page.on("pageerror", onError)
  try {
    await page.goto(`${site!.origin}${PANEL_PAGE_PATH}?panel=${panel}`, {
      waitUntil: "load",
    })
    // Wait for the mount rather than guessing at it: a lazy applet that needs
    // one frame more than a fixed sleep would otherwise be reported as a
    // harness failure on a slow machine.
    await page
      .waitForFunction(
        () =>
          (document.querySelector("[data-fit-slot]")?.childElementCount ?? 0) >
          0,
        undefined,
        { timeout: 10_000 }
      )
      .catch(() => undefined)
    // Panels that measure themselves (the hex grid sizes its cells to the
    // rect) need a few frames to settle.
    await page.waitForTimeout(400)

    return { ...(await findViolations(page, [...ALLOWED_FIT_INTENTS])), errors }
  } finally {
    page.off("pageerror", onError)
  }
}

/** Why a panel rendered nothing, with what the page threw if it threw. */
function renderedNothing(panel: SweptPanel, errors: Array<string>): string {
  const thrown = errors.length > 0 ? ` It threw: ${errors.join(" | ")}` : ""
  return (
    `${panel.label} (${panel.panel}): rendered nothing — a panel the sweep ` +
    `cannot measure is a harness failure, not a pass.${thrown}`
  )
}

// One test walks every panel at one viewport; the config's 15s default is
// sized for the fixture specs next door, which load one page each.
test.describe.configure({ timeout: 5 * 60 * 1000 })

test.beforeAll(async () => {
  if (BUILT) site = await serve(PANEL_PAGE_BUILD)
})

test.afterAll(async () => {
  await site?.close()
})

test.describe("every panel fits the rect the viewport grants it", () => {
  // Locally a missing build is a skip with directions. Under CI it is a
  // failure (the first test below): a build step that broke must not turn
  // this gate into a green run that measured nothing.
  test.skip(
    !BUILT && !process.env["CI"],
    `No panel page at ${PANEL_PAGE_BUILD}. Build one first: ` +
      `pnpm --filter www build:fit (or point WWW_FIT_HARNESS_DIST at one).`
  )

  test("the panel page is built, and every fixture on it is swept", async ({
    page,
  }) => {
    expect(
      BUILT,
      `No panel page at ${PANEL_PAGE_BUILD}: run pnpm --filter www build:fit.`
    ).toBe(true)

    // `PanelId` typing catches a swept id with no fixture (and a missing one
    // renders nothing below). It cannot catch the reverse: a fixture added to
    // the page that neither PANELS nor PANEL_STAGES names, which would sit
    // there unmeasured.
    await page.goto(`${site!.origin}${PANEL_PAGE_PATH}`)
    const swept = new Set<string>([
      ...SWEPT.map((panel) => panel.panel),
      PLANTED_OVERFLOW,
    ])
    const unswept = (
      await page.locator("[data-fit-panels] li").allTextContents()
    ).filter((panel) => !swept.has(panel))
    expect(
      unswept,
      `These fixtures are on the panel page but nothing sweeps them; add each ` +
        `to PANELS or PANEL_STAGES: ${unswept.join(", ")}`
    ).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`fits at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      const failures: Array<string> = []

      for (const panel of SWEPT) {
        // Known-unfitted panels are held by the debt test below instead, so
        // this one stays a clean signal: it goes red only for a regression.
        if (panel.debt !== null) continue

        const { mounted, violations, errors } = await measure(page, panel.panel)

        if (!mounted) {
          failures.push(renderedNothing(panel, errors))
          continue
        }

        for (const violation of violations) {
          failures.push(describe(panel, violation))
        }
      }

      expect(failures, failures.join("\n")).toEqual([])
    })
  }

  /**
   * Debt that has been paid stops being debt.
   *
   * A list of "known not to fit" entries rots the moment one of them starts
   * fitting: the panel is then unguarded, and nothing says so. This asserts
   * the other direction - every `debt` entry must still overflow at some
   * viewport - so the way to make this test pass again is to delete the entry,
   * which puts the panel back under the sweep above.
   */
  test("every debt entry still overflows", async ({ page }) => {
    const failures: Array<string> = []

    for (const panel of SWEPT) {
      if (panel.debt === null) continue

      let overflowedSomewhere = false
      let renderedSomewhere = false
      const thrown: Array<string> = []

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        })
        const { mounted, violations, errors } = await measure(page, panel.panel)
        thrown.push(...errors)
        // A panel that renders nothing is not evidence of anything, least of
        // all of an overflow - counting it as "still overflowing" would let a
        // debt panel go dark and keep this test green.
        if (!mounted) continue
        renderedSomewhere = true
        if (violations.length > 0) {
          overflowedSomewhere = true
          break
        }
      }

      if (!renderedSomewhere) {
        failures.push(`  ${renderedNothing(panel, thrown)} (at every viewport)`)
        continue
      }

      if (!overflowedSomewhere) {
        failures.push(
          `  ${panel.label}: now fits at every viewport. Delete its debt from ` +
            `PANELS so the sweep guards it again. Recorded as: ${panel.debt}`
        )
      }
    }

    expect(
      failures,
      `Debt entries are only honest while they still describe reality:\n${failures.join("\n")}`
    ).toEqual([])
  })

  /**
   * The guard the doctrine asks for: plant a panel that cannot fit and confirm
   * the measurement sees it. It is a fixture on the same built page as the
   * real panels, so a harness that silently measured nothing (a selector
   * typo, a slot that stopped being definite, a build that mounts nothing)
   * fails here instead of reporting every panel above as fitting.
   */
  test("a panel that overflows its rect is seen", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 })

    const { mounted, violations, errors } = await measure(
      page,
      PLANTED_OVERFLOW
    )

    expect(
      mounted,
      `The planted panel rendered nothing: ${errors.join(" | ")}`
    ).toBe(true)
    expect(
      violations.some(
        (violation) =>
          violation.kind === "leak" &&
          violation.classes.includes("planted-panel")
      ),
      `The planted panel holds 900px of content in a 400px rect and does not ` +
        `clip it. If this is not reported, the sweep above is measuring ` +
        `nothing: ${JSON.stringify(violations)}`
    ).toBe(true)
  })
})
