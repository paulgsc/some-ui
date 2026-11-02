/**
 * The refresh port (PULL1): a refresher counts for the pulls that start
 * while it is registered, every one runs together, the answer names each
 * that could not read, one dropped before it answered (its screen went
 * away) is stale and left out, and one check runs at a time.
 */
import { describe, expect, it, vi } from "vitest"

import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { createRefreshers } from "@/lib/pull-refresh/refreshers"

type Held = Refresher & {
  readonly calls: () => number
  readonly answer: () => void
  readonly fail: () => void
}

/** A refresher whose every check waits until the test answers it. */
function held(what: string): Held {
  const pending: Array<{ resolve: () => void; reject: () => void }> = []
  return {
    what,
    checkAgain: () =>
      new Promise<void>((resolve, reject) =>
        pending.push({ resolve, reject: () => reject(new Error(what)) })
      ),
    calls: () => pending.length,
    answer: () => pending.forEach(({ resolve }) => resolve()),
    fail: () => pending.forEach(({ reject }) => reject()),
  }
}

/** Lets the checks a pull started begin: each starts on a microtask. */
const started = (): Promise<void> => Promise.resolve()

describe("the refresh port", () => {
  it("runs nothing, and answers at once, with nothing registered", async () => {
    expect(await createRefreshers().checkAll()).toEqual([])
  })

  it("runs every registered refresher together, and names each that failed", async () => {
    const refreshers = createRefreshers()
    const digest = held("today’s digest")
    const run = held("the morning run")
    refreshers.register(digest)
    refreshers.register(run)

    const pull = refreshers.checkAll()
    await started()
    expect([digest.calls(), run.calls()]).toEqual([1, 1])
    digest.fail()
    run.answer()
    expect(await pull).toEqual(["today’s digest"])
  })

  it("counts a refresher only while its screen is shown", async () => {
    const refreshers = createRefreshers()
    const check = vi.fn(() => Promise.resolve())
    const drop = refreshers.register({ what: "home", checkAgain: check })
    await refreshers.checkAll()
    drop()
    await refreshers.checkAll()
    expect(check).toHaveBeenCalledTimes(1)
    // Dropping twice is dropping once.
    drop()
  })

  it("leaves out a refresher dropped before it answered: its answer is stale", async () => {
    const refreshers = createRefreshers()
    const gone = held("what home holds")
    const stays = held("today’s digest")
    const drop = refreshers.register(gone)
    refreshers.register(stays)

    const pull = refreshers.checkAll()
    await started()
    // The screen goes, then its late answer fails: neither holds the pull up
    // nor reaches its answer.
    drop()
    stays.answer()
    expect(await pull).toEqual([])
    gone.fail()
  })

  it("counts a refresher that throws before it returns as one that could not read", async () => {
    const refreshers = createRefreshers()
    refreshers.register({
      what: "the routine’s files",
      checkAgain: () => {
        throw new Error("not a promise")
      },
    })
    expect(await refreshers.checkAll()).toEqual(["the routine’s files"])
  })

  it("leaves a refresher registered during a pull to the next one", async () => {
    const refreshers = createRefreshers()
    const first = held("first")
    refreshers.register(first)
    const pull = refreshers.checkAll()
    const late = held("late")
    refreshers.register(late)
    await started()
    first.answer()
    expect(await pull).toEqual([])
    expect(late.calls()).toBe(0)
  })

  it("answers a second ask while one is out with that one, never checking twice at once", async () => {
    // As when the page moves on mid-check, or a new shell mount pulls over
    // the same set.
    const refreshers = createRefreshers()
    const digest = held("today’s digest")
    refreshers.register(digest)
    const first = refreshers.checkAll()
    const second = refreshers.checkAll()
    expect(second).toBe(first)
    await started()
    expect(digest.calls()).toBe(1)
    digest.fail()
    expect(await second).toEqual(["today’s digest"])

    // Once it ended, the next ask checks again.
    const third = refreshers.checkAll()
    expect(third).not.toBe(first)
    await started()
    expect(digest.calls()).toBe(2)
  })
})
