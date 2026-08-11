/**
 * Does every panel fit the rect the session viewport grants it? (#899.)
 *
 * ## The gap this closes
 *
 * The Storybook sweep next door renders every story in a canvas of unbounded
 * height. That makes it blind to the whole class of failure #899 reported: a
 * component whose box comes from its *host* has no host in a story, so
 * `h-full` resolves against `auto`, the content sets its own height, and
 * "content fits its box" is vacuously true because there is no box. The same
 * component in `/sessions/$id` is handed a leaf rect of a few hundred pixels
 * and paints the rest of itself over whatever the layout put below it -
 * which is exactly what the screenshot on #899 shows the TOPIK quiz summary
 * doing.
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
 * keyed by `RegistryKey`. Adding a panel without a swept story is then a
 * type error, not an omission nobody notices.
 *
 * ## How the rect is granted
 *
 * `#storybook-root` is pinned to the viewport and `overflow: hidden`, and the
 * decorator chain below it is made definite down to the panel - the same shape
 * `RenderSolved` gives a leaf (`absolute` rect, `overflow-hidden`, an inner
 * `size-full` box). Overflow is then measured with `getBoundingClientRect` and
 * `scrollHeight`, both of which report where content *would* paint, so
 * clipping cannot hide a regression from this sweep the way it hides it from
 * the eye.
 *
 * Run against a built Storybook:
 *
 *   CI=1 pnpm build-storybook -o storybook-static
 *   STORYBOOK_STATIC=storybook-static pnpm --filter www test:ui-fit
 *
 * Skips itself with a clear message when no build is pointed at, and fails
 * rather than passes when a story renders nothing - a sweep that measures an
 * empty root and reports success is worse than no sweep. Both properties are
 * the ones the sweep next door learned the hard way.
 */

import { expect, test, type Page } from "@playwright/test"
import type { RegistryKey } from "@some-ui/content-registry"

import { loadStoryIds, serve, STORYBOOK_STATIC, VIEWPORTS } from "./harness"

/**
 * How this sweep sees a panel. Three states, and two of them are debt:
 *
 *   `story`    swept and held to the invariant.
 *   `debt`     swept, known not to fit, with the reason. Reported rather than
 *              failed - and the sweep asserts it *still* overflows, so an
 *              entry cannot quietly rot after someone fixes the panel.
 *   `unswept`  no story mounts this component at all, so there is nothing to
 *              measure. The weakest state, and the one to argue down first.
 *
 * Every entry that is not `story` is an admission, not a category. #899 fixed
 * the TOPIK applet; the rest predate it and each needs its own fit decision.
 */
type PanelCoverage =
  | { story: string }
  | { story: string; debt: string }
  | { unswept: string }

/**
 * Every registry key, and where this sweep sees it. `Record<RegistryKey, …>`
 * is load-bearing: a new panel in `componentRegistry` fails `tsc` here until
 * someone says how it gets fitted.
 */
const PANELS: Record<RegistryKey, PanelCoverage> = {
  cube: { unswept: "registry-owned overlay demo; ships no story to sweep" },
  hangul: {
    story: "ui-honeycomb-hangul-flow-hangulhexgrid--endless",
    debt: "the hex grid's last row clears the rect by ~10px on a short leaf; the grid measures its own cell size and needs to measure the rect too",
  },
  leetype: {
    story: "ui-input-components-typing-leetype--default",
    debt: "the story mounts the applet in an `h-screen` page shell, and the code pane's long lines clear the rect sideways",
  },
  scheduled: { unswept: "ActiveLifetimesPanel ships no story to sweep" },
  music: {
    story: "ui-umag-components-nowplaying-nowplayingcard--default",
    debt: "the now-playing card's glow layer paints ~18px wider than the card",
  },
  voice: {
    story: "ui-umag-components-voiceui-avatar--default",
    debt: "VoiceAvatar's root is `min-h-screen`: it asks for the window rather than accepting the rect it is given",
  },
  neon: {
    story: "ui-neonsign-components-headline--default",
    debt: "the story mounts the headline in a `min-h-screen` page shell, so the sweep measures a page, not a panel",
  },
  topik: { story: "ui-chat-components-topik-koreanstudypage--default" },
  assessment: {
    story: "ui-assessment-components-technicalblockassessment--default",
  },
  interview: {
    story: "ui-chat-interview-interviewapp--default",
    debt: "every phase of InterviewApp roots at `min-h-screen items-center` - the same 'ask for the window' shape as VoiceAvatar, in six files",
  },
  "cdrama-header": {
    story: "ui-makjang-components-cdrama-dramaheader--default",
    debt: "the episode/title row does not wrap, so it clears the rect sideways on a narrow leaf",
  },
  "cdrama-couple": {
    story: "ui-makjang-components-cdrama-couplerating--default",
    debt: "the rating body is taller than a short leaf and neither pages nor bounds",
  },
  "cdrama-metrics": {
    story: "ui-makjang-components-cdrama-metricspanel--default",
    debt: "the metric bars are sized from a percentage of a width they assume rather than the rect's, and run far past it",
  },
  "cdrama-emoji": {
    story: "ui-makjang-components-cdrama-emojitimeline--default",
    debt: "timeline markers are positioned past the right edge on a narrow leaf",
  },
  "cdrama-ost": {
    story: "ui-makjang-components-cdrama-ostpanel--default",
    debt: "the OST card's inner box holds ~5px more than it can, in both axes - small enough to be a padding/border arithmetic slip rather than a layout decision",
  },
}

/**
 * Stages a panel passes through that a single top-level story never reaches.
 * The TOPIK applet only shows its summary after ten answers, so the story that
 * mounts the applet renders the one state that always fitted - which is how
 * #899 shipped. A stage with its own story is swept as its own panel.
 */
const PANEL_STAGES: ReadonlyArray<string> = [
  "ui-chat-components-topik-quizstates-quizidle--playing",
  "ui-chat-components-topik-quizstates-quizready--default",
  "ui-chat-components-topik-quizstates-quizactive--multiple-choice",
  "ui-chat-components-topik-quizstates-quizactive--text-input",
  "ui-chat-components-topik-quizstates-quizfeedback--incorrect-text-input",
  "ui-chat-components-topik-quizstates-quizsummary--advanced",
  "ui-chat-components-topik-quizstates-quizsummary--failed",
]

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

/** The grant: a leaf-shaped rect for the story root to fill. */
const GRANT_RECT = `
  html, body { height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
  #storybook-root { position: absolute !important; inset: 0 !important; padding: 0 !important; overflow: hidden !important; }
`

/**
 * Hand the rect down the decorator chain to the panel.
 *
 * Storybook's own wrappers (the theme decorator, the UnoCSS decorator) size to
 * content, and a percentage height against an `auto` parent computes to `auto`
 * - so a panel rooted at `h-full` would quietly go back to sizing itself and
 * the sweep would measure the same unbounded canvas the sweep next door does.
 * Walking the single-child chain and making each link definite is the harness
 * standing in for `SidebarInset → SessionViewport → RenderSolved`'s leaf, which
 * is a definite chain all the way down in the app.
 *
 * The walk stops at the first element that asks for its host's box, because
 * that element is the panel: giving *it* the full height is what a leaf does,
 * and going deeper would start reshaping the component's own internals.
 */
async function grantRect(page: Page): Promise<void> {
  await page.addStyleTag({ content: GRANT_RECT })
  await page.evaluate(() => {
    const asksForHostBox = /(^|\s)(h-full|size-full|h-screen)(\s|$)/
    let node: Element | null = document.getElementById("storybook-root")
    for (let depth = 0; node && depth < 8; depth += 1) {
      // Empty siblings (the toaster decorator mounts a zero-height <section>)
      // do not make a wrapper ambiguous - only painted children do.
      const painted = Array.from(node.children).filter((element) => {
        const box = element.getBoundingClientRect()
        return box.height > 0 && box.width > 0
      })
      if (painted.length !== 1) break
      const child = painted[0]
      if (!(child instanceof HTMLElement)) break
      child.style.height = "100%"
      if (asksForHostBox.test(child.className.toString())) break
      node = child
    }
  })
}

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
      const root = document.getElementById("storybook-root")
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

type SweptPanel = { label: string; story: string; debt: string | null }

/** One violation, said in the terms of the fix rather than the measurement. */
function describe(panel: SweptPanel, violation: Violation): string {
  const where = `${panel.label} (${panel.story}): <${violation.tag}>`
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
      "story" in coverage
        ? [
            {
              label: key,
              story: coverage.story,
              debt: "debt" in coverage ? coverage.debt : null,
            },
          ]
        : []
  ),
  ...PANEL_STAGES.map((story) => ({ label: story, story, debt: null })),
]

const STORY_IDS = new Set(loadStoryIds().map((entry) => entry.id))

/** Mount one panel in a granted rect and measure what leaves it. */
async function measure(
  page: Page,
  story: string
): Promise<{ mounted: boolean; violations: Array<Violation> }> {
  await page.goto(
    `${storybook!.origin}/iframe.html?id=${story}&viewMode=story`,
    { waitUntil: "load" }
  )
  // Wait for the mount rather than guessing at it: a lazy applet that needs
  // one frame more than a fixed sleep would otherwise be reported as a
  // harness failure on a slow machine. This has to happen *before* the rect is
  // granted - the grant walks the mounted tree, and walking an empty root
  // hands out nothing, which reads as "every panel fits".
  await page
    .waitForFunction(
      () =>
        (document.getElementById("storybook-root")?.childElementCount ?? 0) > 0,
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => undefined)
  // Panels that measure themselves need a frame to settle.
  await page.waitForTimeout(250)

  await grantRect(page)
  // And another for anything that re-measures once the rect changes.
  await page.waitForTimeout(150)

  return findViolations(page, [...ALLOWED_FIT_INTENTS])
}

// One test walks every panel at one viewport; the config's 15s default is
// sized for the fixture specs next door, which load one page each.
test.describe.configure({ timeout: 5 * 60 * 1000 })

let storybook: { origin: string; close: () => Promise<void> } | null = null

test.beforeAll(async () => {
  if (STORY_IDS.size > 0) storybook = await serve(STORYBOOK_STATIC)
})

test.afterAll(async () => {
  await storybook?.close()
})

test.describe("every panel fits the rect the viewport grants it", () => {
  test.skip(
    STORY_IDS.size === 0,
    `No built Storybook at ${STORYBOOK_STATIC}. Build one first: ` +
      `CI=1 pnpm build-storybook -o storybook-static, then re-run with ` +
      `STORYBOOK_STATIC pointing at it.`
  )

  test("every swept panel names a story that exists", () => {
    // A workspace-scoped build (STORYBOOK_WORKSPACE=<pkg>) legitimately holds
    // only one package's stories, so absence alone proves nothing. What does
    // prove something: the component is in this build and the *named story* of
    // it is not - that is a rename, and a renamed story stops being swept.
    const components = new Set(
      [...STORY_IDS].map((id) => id.slice(0, id.lastIndexOf("--")))
    )
    const missing = SWEPT.filter(
      (panel) =>
        !STORY_IDS.has(panel.story) &&
        components.has(panel.story.slice(0, panel.story.lastIndexOf("--")))
    )
    expect(
      missing,
      `These panels name a story id the built Storybook does not have — a ` +
        `renamed story silently stops being swept, so the id is asserted ` +
        `rather than looked up:\n${missing
          .map((panel) => `  ${panel.label} → ${panel.story}`)
          .join("\n")}`
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
        if (!STORY_IDS.has(panel.story)) continue
        // Known-unfitted panels are held by the debt test below instead, so
        // this one stays a clean signal: it goes red only for a regression.
        if (panel.debt !== null) continue

        const { mounted, violations } = await measure(page, panel.story)

        if (!mounted) {
          failures.push(
            `${panel.label} (${panel.story}): rendered nothing — a panel the ` +
              `sweep cannot measure is a harness failure, not a pass.`
          )
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
      if (panel.debt === null || !STORY_IDS.has(panel.story)) continue

      let overflowedSomewhere = false
      let renderedSomewhere = false

      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        })
        const { mounted, violations } = await measure(page, panel.story)
        // A story that renders nothing is not evidence of anything, least of
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
        failures.push(
          `  ${panel.label} (${panel.story}): rendered nothing at any viewport — ` +
            `the debt entry cannot be checked, which is a harness failure, not a pass.`
        )
        continue
      }

      if (!overflowedSomewhere) {
        failures.push(
          `  ${panel.label}: now fits at every viewport. Delete its entry from ` +
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
   * the measurement sees it. Without this, a harness that silently measured
   * nothing (a selector typo, a normalisation that stopped applying) would
   * report every panel above as fitting.
   */
  test("a panel that overflows its rect is seen", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 })
    // Shaped like a real story: a decorator wrapper, a panel that fills the
    // rect it is granted, and content inside it that does not fit.
    await page.setContent(`
      <div id="storybook-root">
        <div class="decorator">
          <div class="h-full panel">
            <div style="height: 900px" class="oversized-panel">too tall</div>
          </div>
        </div>
      </div>
    `)
    await grantRect(page)

    const { mounted, violations } = await findViolations(page, [])

    expect(mounted).toBe(true)
    expect(
      violations.some(
        (violation) =>
          violation.kind === "leak" && violation.classes.includes("panel")
      ),
      `The planted panel holds 900px of content in a 400px rect and does not ` +
        `clip it. If this is not reported, the sweep above is measuring ` +
        `nothing: ${JSON.stringify(violations)}`
    ).toBe(true)
  })
})
