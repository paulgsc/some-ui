/**
 * The browser-unresponsive canary — the one layer that measures the thing
 * itself rather than a proxy for it.
 *
 * `tests/budgets/` bounds the classifier's traversal analytically: node
 * visits, computed-style reads, retained elements, growth against document
 * size. Those are deterministic, they run everywhere, and they are what CI
 * blocks on. What they cannot tell you is how many milliseconds the main
 * thread is actually held, because that depends on a real style engine —
 * jsdom's `getComputedStyle` has nothing to do with Blink's.
 *
 * This spec closes that gap. It drives the real extension, through
 * `--load-extension`, against a real "Files changed"-shaped page in real
 * Chromium, and measures the longest uninterrupted main-thread task the
 * extension's own reconcile round produces.
 *
 * ── what "unresponsive" means, and why the budget sits where it does ─────
 *
 * Chromium's "Page unresponsive" dialog fires on a multi-second hang. That
 * is the *fatal* threshold, and a budget set there would be useless: it
 * would only fail once the product was already unusable, on the fastest CI
 * runner, and would pass on the regression that hangs a slower laptop. The
 * budget below is deliberately far beneath it — past the point where input
 * handling visibly stalls, well short of the dialog. The purpose is to fail
 * *before* the dialog, not at it.
 *
 * ── the measurement, and the confound it avoids ──────────────────────────
 *
 * Building a 100k-element fixture is itself a multi-hundred-millisecond
 * task, and it happens immediately before the round being measured. Long
 * tasks are therefore collected with their start times, a timestamp is
 * taken once the build returns, and only tasks starting after it are
 * counted. `RECONCILE_POLICY.debounceMs` is 50ms, so the round under
 * measurement is cleanly separated from the build that triggered it.
 *
 * Marked `.manual`-free deliberately: this runs in the ordinary suite. It
 * is slower than its neighbours — building the fixture is most of it — but
 * an extension that can hang a tab is not something to check on request.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"

declare global {
  // Same idiom, and same reason, as tests/e2e/fixtures/scope-registry-window-types.ts.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging into the global Window requires `interface`; `type` cannot merge.
  interface Window {
    /** Installed by the `dense-diff-page` fixture — see that file's header. */
    __buildDenseDiff?: (files: number, linesPerFile: number) => number
  }
}

/**
 * A normal-sized pull request, not a pathological one: 60 changed files at
 * 200 rows each, three elements a row, so ~36,000 elements. GitHub renders
 * exactly this without complaint; the question is only what this extension
 * adds on top of it.
 *
 * Deliberately well under a genuinely large pull request (60 files x 400+
 * rows on GitHub's real markup is north of 100,000 elements). The
 * classifier's cost is linear in element count — `tests/budgets/
 * classifier-traversal-budget.test.ts` measures that growth at 2.00x for a
 * 2x document — so whatever this size costs, triple it for the page that
 * actually prompts a bug report. The fixture is sized for a test that
 * finishes in seconds, not to reproduce the worst case; it does not need
 * to, because the worst case is arithmetic from here.
 */
const FILES = 60
const LINES_PER_FILE = 200

/**
 * The longest single main-thread task the extension may produce for one
 * reconcile round.
 *
 * 50ms is the standard long-task threshold — the point past which a task is
 * long enough to swallow an input event. 750ms is fifteen times that: a
 * frankly terrible frame that nobody would call acceptable, chosen high
 * enough that runner-speed variance cannot flake it and low enough that it
 * still sits an order of magnitude below the hang dialog. A regression that
 * makes the classifier's cost scale with document size does not land near
 * this line, it lands multiples past it.
 */
const MAX_MAIN_THREAD_BLOCK_MS = 750

/**
 * Total blocking time attributable to the round — the sum of the amount by
 * which each long task exceeds 50ms. A pass split into twenty 200ms tasks
 * is not a fix, and this is the number that says so.
 */
const MAX_TOTAL_BLOCKING_TIME_MS = 1_500

/** Long enough for RECONCILE_POLICY's 50ms debounce plus the round it schedules. */
const ROUND_WINDOW_MS = 10_000

type LongTaskReport = {
  readonly elements: number
  readonly buildEndedAt: number
  readonly longest: number
  readonly totalBlocking: number
  readonly taskCount: number
}

test.describe("browser-unresponsive canary", () => {
  test("one reconcile round over a dense diff does not block the main thread past budget", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dense-diff-page")

    // Settle against the trivial page first, so the measurement below sees a
    // reconcile round triggered by the fixture growing — the SPA-navigation
    // shape this actually has to survive — rather than first-load init.
    const settled = await waitForClassification(page)
    expect(settled.themeApplied).toBe("dark")

    const report = await page.evaluate(
      async ([files, linesPerFile, windowMs]): Promise<LongTaskReport> => {
        const tasks: Array<{ start: number; duration: number }> = []

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push({ start: entry.startTime, duration: entry.duration })
          }
        })
        observer.observe({ entryTypes: ["longtask"] })

        const build = window.__buildDenseDiff
        if (build === undefined) {
          throw new Error(
            "dense-diff-page fixture did not install __buildDenseDiff — the " +
              "measurement below would report an untouched page as passing."
          )
        }

        const elements = build(files, linesPerFile)
        // Flush layout so the build's own cost is fully accounted to the
        // build, not deferred into the window being measured.
        void document.body.offsetHeight
        const buildEndedAt = performance.now()

        await new Promise((resolve) => setTimeout(resolve, windowMs))
        observer.disconnect()

        const afterBuild = tasks.filter((t) => t.start >= buildEndedAt)
        const longest = afterBuild.reduce((a, t) => Math.max(a, t.duration), 0)
        const totalBlocking = afterBuild.reduce(
          (a, t) => a + Math.max(0, t.duration - 50),
          0
        )

        return {
          elements,
          buildEndedAt,
          longest,
          totalBlocking,
          taskCount: afterBuild.length,
        }
      },
      [FILES, LINES_PER_FILE, ROUND_WINDOW_MS] as const
    )

    const context =
      `${report.elements.toLocaleString("en-US")} elements, ` +
      `${report.taskCount} long task(s) after the fixture build`

    expect(
      report.longest,
      `The extension held the main thread for ${Math.round(report.longest)}ms in a ` +
        `single uninterruptible task on a ${context}. Nothing — not input, not ` +
        `scrolling, not the tab's own close button — is handled during that task, ` +
        `and Chromium's "Page unresponsive" dialog is the same failure a few ` +
        `multiples further along. The round has to yield: bound the traversal to ` +
        `a node budget per task and resume on the next idle callback. See ` +
        `tests/budgets/README.md.`
    ).toBeLessThanOrEqual(MAX_MAIN_THREAD_BLOCK_MS)

    expect(
      report.totalBlocking,
      `The round's total blocking time was ${Math.round(report.totalBlocking)}ms ` +
        `across ${report.taskCount} long task(s) on a ${context}. Splitting one ` +
        `unbounded pass into several still-too-long passes satisfies the ` +
        `per-task budget without making the page usable, which is what this ` +
        `second budget is for.`
    ).toBeLessThanOrEqual(MAX_TOTAL_BLOCKING_TIME_MS)
  })
})
