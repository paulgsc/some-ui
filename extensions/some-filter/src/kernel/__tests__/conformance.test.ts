/**
 * The kernel conformance suite: the evidence that `budgeted` is true of an
 * effect rather than merely declared of it.
 *
 * `tests/budgets/` checks that every page-affecting effect in the shipped
 * artifact is *declared* with an admissible cost class. That is a real
 * property and it is not the one that keeps a tab responsive — a ledger
 * entry reading `budgeted` next to a pass that walks 120,000 nodes in one
 * task is a lie the gate believes. This suite is what removes that gap for
 * the JS half: it asserts the invariant directly, against traces chosen to
 * break it.
 *
 * The invariant, stated once:
 *
 *   **No dispatch spends more than its budget, and the budget is a constant
 *   of this codebase — independent of S_i (nodes), H_i (depth) and A_i
 *   (arrivals).**
 *
 * Every case below is an attempt to falsify that on a page the extension
 * does not control the shape of.
 */

import {
  COST,
  createCreditMeter,
  CreditExhausted,
  DEFAULT_DISPATCH_BUDGET,
} from "@filter/kernel/credit"
import {
  createCancelToken,
  runBudgeted,
  type BudgetedPass,
} from "@filter/kernel/dispatch"
import { readStyle, walkSubtree } from "@filter/kernel/dom"
import { describe, expect, it } from "vitest"

/** Runs every task immediately, so a multi-task pass completes within one test tick. */
const immediateYield = (resume: () => void): void => {
  resume()
}

/** Builds a tree `breadth` wide and `depth` deep, and returns its element count. */
function buildTree(breadth: number, depth: number): number {
  const node = (d: number): string =>
    d === 0
      ? `<span style="color:#111">leaf</span>`
      : `<div style="background-color:#fff">${Array.from({ length: breadth }, () => node(d - 1)).join("")}</div>`
  document.body.innerHTML = node(depth)
  return document.querySelectorAll("*").length
}

/** A pass that reads computed style for every element under `root`. */
function* sensePass(root: Element): BudgetedPass<number> {
  let seen = 0
  yield* walkSubtree(root, function* (element) {
    yield* readStyle(element)
    seen += 1
  })
  return seen
}

describe("kernel — per-dispatch bound", () => {
  it("never lets a task overspend, however large the document", async () => {
    const nodes = buildTree(6, 5)
    expect(nodes).toBeGreaterThan(5_000)

    const spends: Array<number> = []
    const result = await runBudgeted(sensePass(document.body), {
      yieldToBrowser: immediateYield,
      strict: true,
      onTask: (spent) => spends.push(spent),
    })

    expect(result.kind).toBe("completed")
    // The only task permitted to be short is the last one.
    for (const spent of spends) {
      expect(spent).toBeLessThanOrEqual(
        DEFAULT_DISPATCH_BUDGET + COST.styleRead
      )
    }
    expect(spends.length).toBeGreaterThan(1)
  })

  it("holds the same bound when the document grows — only the task count moves", async () => {
    // Both trees must be big enough to fill more than one task. An earlier
    // version used a 781-element tree for `small`, which completed in a
    // single *partial* task; comparing that partial spend against `large`'s
    // full budget produced a 2.05x ratio that said nothing about scaling.
    // The comparison is only meaningful between two saturated tasks.
    const measure = async (
      breadth: number,
      depth: number
    ): Promise<{ nodes: number; spends: Array<number> }> => {
      const nodes = buildTree(breadth, depth)
      const spends: Array<number> = []
      await runBudgeted(sensePass(document.body), {
        yieldToBrowser: immediateYield,
        strict: true,
        onTask: (spent) => spends.push(spent),
      })
      return { nodes, spends }
    }

    const small = await measure(7, 4)
    const large = await measure(6, 5)

    expect(small.spends.length).toBeGreaterThan(1)
    expect(large.nodes / small.nodes).toBeGreaterThan(2)

    // Saturated tasks only — the final task of any pass is short by
    // construction and is not evidence about the bound.
    const saturated = (xs: ReadonlyArray<number>): ReadonlyArray<number> =>
      xs.slice(0, -1)
    const peak = (xs: ReadonlyArray<number>): number => Math.max(...xs)

    // The property the budgets suite could only assert. Per-task work is
    // flat across a document several times larger; what grows is how many
    // tasks it takes, which is exactly the trade being made.
    expect(peak(large.spends)).toBeLessThanOrEqual(
      DEFAULT_DISPATCH_BUDGET + COST.styleRead
    )
    expect(
      peak(saturated(large.spends)) / peak(saturated(small.spends))
    ).toBeLessThan(1.1)
    expect(large.spends.length).toBeGreaterThan(small.spends.length)
  })

  it("holds the bound on a deep, narrow tree as well as a wide one", async () => {
    // H_i, not just S_i. An ancestor-walking pass is O(S_i x H_i), and a
    // pathologically deep tree is the shape that finds a bound expressed
    // per-element rather than per-unit-of-work.
    buildTree(1, 400)

    const spends: Array<number> = []
    const result = await runBudgeted(sensePass(document.body), {
      yieldToBrowser: immediateYield,
      strict: true,
      onTask: (spent) => spends.push(spent),
    })

    expect(result.kind).toBe("completed")
    for (const spent of spends) {
      expect(spent).toBeLessThanOrEqual(
        DEFAULT_DISPATCH_BUDGET + COST.styleRead
      )
    }
  })

  it("charges the crossing operation but refuses to continue past it", () => {
    // The boundary case the meter's own doc comment describes: a caller
    // discovers exhaustion one step late, and that step is charged. What it
    // must not do is keep spending afterwards.
    const meter = createCreditMeter(10, true)
    expect(meter.spend(8)).toBe(true)
    expect(meter.spend(4)).toBe(false) // crosses; tolerated
    expect(meter.exhausted()).toBe(true)
    expect(() => meter.spend(4)).toThrow(CreditExhausted)
  })
})

describe("kernel — progress and cancellation", () => {
  it("completes a finite document in a finite number of tasks", async () => {
    const nodes = buildTree(5, 4)
    const result = await runBudgeted(sensePass(document.body), {
      yieldToBrowser: immediateYield,
    })

    expect(result.kind).toBe("completed")
    if (result.kind === "completed") {
      // Liveness, not just safety: a bounded pass that never finishes is a
      // permanent blackout, which is not an acceptable fix for a hang.
      // Compared against body's own descendant count rather than the
      // document's, since `nodes` also counts html/head/body.
      expect(result.value).toBe(document.body.querySelectorAll("*").length)
      expect(result.tasks).toBeLessThan(nodes)
    }
  })

  it("stops between tasks when a newer round supersedes it", async () => {
    buildTree(6, 5)
    const token = createCancelToken()

    let tasksRun = 0
    const result = await runBudgeted(sensePass(document.body), {
      yieldToBrowser: immediateYield,
      onTask: () => {
        tasksRun += 1
        if (tasksRun === 2) token.cancel()
      },
      token,
    })

    expect(result.kind).toBe("cancelled")
    expect(result.tasks).toBe(2)
  })

  it("closes the transaction before every yield, not just at the end", async () => {
    // The prepaint contract: the page is only ever unthemed *within* one
    // uninterrupted task. If the transaction spanned a yield, the browser
    // could paint the page with our theming stripped — a white flash on
    // exactly the pages this extension exists to darken.
    buildTree(6, 5)

    let open = false
    let openAtYield = 0
    let transactions = 0

    await runBudgeted(sensePass(document.body), {
      strict: true,
      transaction: <R>(fn: () => R): R => {
        transactions += 1
        open = true
        try {
          return fn()
        } finally {
          open = false
        }
      },
      yieldToBrowser: (resume) => {
        if (open) openAtYield += 1
        resume()
      },
    })

    expect(transactions).toBeGreaterThan(1)
    expect(openAtYield).toBe(0)
  })

  it("closes the transaction when a pass throws mid-task", async () => {
    buildTree(3, 3)
    let open = false

    function* throwingPass(): BudgetedPass<void> {
      yield COST.visit
      throw new Error("sense failed")
    }

    await expect(
      runBudgeted(throwingPass(), {
        yieldToBrowser: immediateYield,
        transaction: <R>(fn: () => R): R => {
          open = true
          try {
            return fn()
          } finally {
            open = false
          }
        },
      })
    ).rejects.toThrow("sense failed")

    // A throw that left the sheets disabled would leave the page rendering
    // unthemed indefinitely — worse than the hang this all exists to fix.
    expect(open).toBe(false)
  })
})
