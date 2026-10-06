/**
 * A duration gate. Other cost rules bound how often a round *starts*
 * (`RECONCILE_POLICY`), how many DOM *writes* happen
 * (`issue-831-quiescence.spec.ts`), but not time: "converges" and
 * "converges cheaply" are different propositions.
 *
 * Measures wall-clock under the three drivers that cost: mutation churn, a
 * continuous pointer sweep, and a *paused* pointer sweep. The paused sweep
 * is essential: a continuous sweep never lets `INTERACTION_SETTLE_MS`
 * elapse, so it never fires the settled-interaction pass — a continuous-only
 * version was green while every pause blocked ~600ms. Stopping costs, not
 * moving.
 *
 * ## What this gate does not cover
 *
 * Chromium only (`fixture.ts`). The regression that prompted it — a
 * document-wide `:has()` on a dynamic pseudo-class — reproduced on Gecko,
 * not here, so this would not have caught it. It catches long tasks our own
 * JavaScript creates; the selector shape Chromium forgives is covered
 * statically by the declarative-cost tests in `theme-apply.test.ts`.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

declare global {
  var __swLongTasks: Array<number>
}

/**
 * Generous on purpose: a gate against a *pathology* (work per input event
 * or mutation batch), not a performance target. A tight threshold would
 * flake on shared CI and get disabled.
 */
const MAX_TOTAL_BLOCKING_MS = 300
const MAX_SINGLE_TASK_MS = 150

/** Pauses in the paused sweep, and the count the invariant is stated against. */
const PAUSE_COUNT = 12

/**
 * Long tasks the paused sweep may produce, total, for {@link PAUSE_COUNT}
 * pauses.
 *
 * Absolute, not per pause: work on this path must be bounded per page, not
 * per interaction. Measured on a 1500-row page, twelve pauses produce **1
 * long task totalling 1168ms** with the self-measuring budget, against **12
 * totalling 13108ms** without it (verified by removing it).
 *
 * The count is what this defends: tasks got bigger when the audit stopped
 * being rooted at the interaction's subtree (see
 * INTERACTION_AUDIT_BUDGET_MS), and a constant number of large tasks per
 * page is survivable where one per pause looks hung.
 *
 * Three leaves headroom for the measured task, the initial classification,
 * and a scheduling artifact, and still fails an order of magnitude below
 * the behaviour it catches.
 */
const MAX_PAUSED_SWEEP_TASKS = 3

type Budget = { tasks: number; totalMs: number; maxMs: number }

async function measure(
  page: Page,
  drive: (page: Page) => Promise<void>
): Promise<Budget> {
  // Declared on the page's global: the lint forbids type assertions.
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

    // Deep and wide like a real view: backdrop resolution climbs ancestors,
    // so depth is part of the cost.
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
