/**
 * A duration gate — the cost discipline this extension did not have.
 *
 * Every other cost rule here measures something other than time.
 * `RECONCILE_POLICY`'s debounce bounds how often a round *starts*;
 * `issue-831-quiescence.spec.ts` counts DOM *writes*; the admission budget
 * that briefly existed counted *elements*. None of them quantifies over
 * duration, so a change could be perfectly compliant with all of them and
 * still occupy the main thread — "converges" and "converges cheaply" are
 * different propositions and only the first was ever formalised.
 *
 * This measures wall-clock, under the two drivers that actually cost:
 * mutation churn, and a scripted pointer sweep. The sweep is not optional
 * decoration — a selector keyed on interaction state costs nothing until
 * something moves, so a mutation-only fixture cannot see that entire class
 * of regression.
 *
 * ## What this gate does not cover, stated plainly
 *
 * It runs on Chromium, because that is the only engine this project's
 * fixture can drive (`fixture.ts` explains why). The regression that
 * prompted it — a document-wide `:has()` on a dynamic pseudo-class —
 * reproduced on Gecko and *not* here, because Chromium's `:has()`
 * invalidation is far better optimised. So this gate would not have caught
 * the incident it exists because of.
 *
 * That is not a reason to skip it; it is a reason to know what it is for.
 * It catches long tasks this extension's *own JavaScript* creates, which is
 * the larger and more portable class. The selector shape that Chromium
 * forgives is covered separately and statically, by the declarative-cost
 * tests over `DARK_THEME_BODY_RULES` in `theme-apply.test.ts` — a lint, not
 * a measurement, precisely because no measurement available here can see
 * it.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

declare global {
  var __swLongTasks: Array<number>
}

/**
 * Generous on purpose. This is a regression gate against a *pathology* — a
 * mechanism that occupies the thread per input event or per mutation batch
 * — not a performance target. A threshold tight enough to measure ordinary
 * variance would flake on shared CI and get disabled, which is worse than
 * a loose threshold that stays green and red in the right places.
 */
const MAX_TOTAL_BLOCKING_MS = 300
const MAX_SINGLE_TASK_MS = 150

type Budget = { tasks: number; totalMs: number; maxMs: number }

async function measure(
  page: Page,
  drive: (page: Page) => Promise<void>
): Promise<Budget> {
  // Declared on the page's own global rather than cast onto `window`: the
  // lint here forbids type assertions outright, and a module-scope
  // declaration is what the types actually want.
  await page.evaluate(() => {
    globalThis.__swLongTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        globalThis.__swLongTasks.push(entry.duration)
      }
    }).observe({ entryTypes: ["longtask"] })
  })

  await drive(page)

  const durations = await page.evaluate(() => globalThis.__swLongTasks)
  return {
    tasks: durations.length,
    totalMs: durations.reduce((a, b) => a + b, 0),
    maxMs: Math.max(0, ...durations),
  }
}

async function populate(page: Page, rows: number): Promise<void> {
  await page.evaluate((count) => {
    const root = document.createElement("div")
    root.id = "budget-rows"
    for (let i = 0; i < count; i += 1) {
      const row = document.createElement("div")
      row.className = "vendor-row"
      row.appendChild(document.createTextNode(`row ${i}`))
      root.appendChild(row)
    }
    document.body.appendChild(root)
  }, rows)
  await page.waitForTimeout(1000)
}

test.describe("main-thread budget", () => {
  test("a pointer sweep over a populated page costs no long tasks", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)
    await populate(page, 400)

    const budget = await measure(page, async (p) => {
      for (let i = 0; i < 60; i += 1) {
        await p.mouse.move(120 + (i % 20) * 9, 140 + i * 8)
      }
    })

    expect(
      budget.totalMs,
      `pointer sweep blocked ${Math.round(budget.totalMs)}ms across ${budget.tasks} long tasks`
    ).toBeLessThan(MAX_TOTAL_BLOCKING_MS)
    expect(budget.maxMs).toBeLessThan(MAX_SINGLE_TASK_MS)
  })

  test("sustained mutation churn costs no long tasks", async ({ fixture }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)
    await populate(page, 200)

    const budget = await measure(page, async (p) => {
      // 40 insert/remove cycles: every one is a mutation batch reaching the
      // observer, a provisional mark, and a debounced round behind it.
      await p.evaluate(
        async () =>
          new Promise<void>((resolve) => {
            let n = 0
            const step = (): void => {
              const host = document.createElement("div")
              host.className = "churn"
              for (let i = 0; i < 20; i += 1) {
                const card = document.createElement("div")
                card.style.backgroundColor = "rgb(238,238,238)"
                host.appendChild(card)
              }
              document.body.appendChild(host)
              document.querySelectorAll(".churn").forEach((el, index) => {
                if (
                  index === 0 &&
                  document.querySelectorAll(".churn").length > 3
                )
                  el.remove()
              })
              n += 1
              if (n < 40) setTimeout(step, 25)
              else setTimeout(resolve, 400)
            }
            step()
          })
      )
    })

    expect(
      budget.totalMs,
      `churn blocked ${Math.round(budget.totalMs)}ms across ${budget.tasks} long tasks`
    ).toBeLessThan(MAX_TOTAL_BLOCKING_MS)
    expect(budget.maxMs).toBeLessThan(MAX_SINGLE_TASK_MS)
  })
})
