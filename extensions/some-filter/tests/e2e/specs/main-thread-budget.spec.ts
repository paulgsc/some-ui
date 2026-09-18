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
 * This measures wall-clock, under the three drivers that actually cost:
 * mutation churn, a continuous pointer sweep, and a *paused* pointer sweep.
 *
 * The third is not a variation on the second, and leaving it out is how the
 * worst regression in this file's history went unmeasured. A continuous
 * sweep never lets `INTERACTION_SETTLE_MS` elapse, so it never fires the
 * settled-interaction pass at all — the first version of this spec swept
 * continuously, reported zero long tasks, and was green while every pointer
 * *pause* on a large page blocked the main thread for ~600ms. What costs
 * here is stopping, not moving.
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

/**
 * Pauses in the paused sweep, and the count the invariant is stated
 * against.
 */
const PAUSE_COUNT = 12

/**
 * Long tasks the paused sweep may produce, total, for {@link PAUSE_COUNT}
 * pauses.
 *
 * Deliberately an absolute count rather than a per-pause average, because
 * the property being defended is that the two are *unrelated*: work on this
 * path must be bounded per page, not per interaction. Measured on a
 * 1500-row page, twelve pauses produce **2 long tasks totalling 2096ms**
 * with the self-measuring budget in place, against **12 totalling 13108ms**
 * with it removed — verified by removing it, not assumed.
 *
 * The count is what this defends, not the milliseconds. Each remaining task
 * got *bigger* when the audit stopped being rooted at the interaction's own
 * subtree (see INTERACTION_AUDIT_BUDGET_MS — a partial scan could not
 * safely drive this channel's document-scoped realization), and that is the
 * right trade: a constant number of large tasks per page is survivable,
 * one per pointer pause is a browser that appears hung.
 *
 * Three leaves headroom for the measured pair plus a scheduling artifact,
 * and still fails an order of magnitude below the behaviour it exists to
 * catch.
 */
const MAX_PAUSED_SWEEP_TASKS = 3

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
    const page = await fixture.goto("light-page")
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

  test("a PAUSED pointer sweep does not scale long tasks with pauses", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)

    // Deep and wide, like a real application view rather than a flat list:
    // the audit this defends against resolves each carrier's backdrop by
    // climbing ancestors, so depth is part of what makes it expensive.
    await page.evaluate(() => {
      const root = document.createElement("div")
      let cursor: HTMLElement = root
      for (let depth = 0; depth < 12; depth += 1) {
        const nest = document.createElement("div")
        cursor.appendChild(nest)
        cursor = nest
      }
      for (let i = 0; i < 1500; i += 1) {
        const row = document.createElement("div")
        row.className = "vendor-row"
        const label = document.createElement("span")
        label.textContent = `cell ${i}`
        const detail = document.createElement("span")
        detail.style.color = "rgb(40, 40, 40)"
        detail.textContent = " detail"
        row.append(label, detail)
        cursor.appendChild(row)
      }
      document.body.appendChild(root)
    })
    await page.waitForTimeout(1500)

    const budget = await measure(page, async (p) => {
      for (let i = 0; i < PAUSE_COUNT; i += 1) {
        await p.mouse.move(150 + i * 12, 200 + i * 20)
        // Past INTERACTION_SETTLE_MS, so the settled pass actually fires.
        // This wait is the entire test.
        await p.waitForTimeout(180)
      }
      await p.waitForTimeout(400)
    })

    expect(
      budget.tasks,
      `${PAUSE_COUNT} pointer pauses produced ${budget.tasks} long tasks ` +
        `totalling ${Math.round(budget.totalMs)}ms — interaction-path work ` +
        `must be bounded per page, not per pause`
    ).toBeLessThanOrEqual(MAX_PAUSED_SWEEP_TASKS)
  })

  test("sustained mutation churn costs no long tasks", async ({ fixture }) => {
    const page = await fixture.goto("light-page")
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
