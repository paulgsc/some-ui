/** The refresh port (PULL1). */
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

  it("asks a refresher registered while a check is out on the next ask, never asking one twice at once", async () => {
    // As when the page moves on mid-check and the new page is pulled, or a
    // new shell mount pulls over the same set.
    const refreshers = createRefreshers()
    const first = held("first")
    refreshers.register(first)
    const pull = refreshers.checkAll()
    await started()
    const late = held("late")
    refreshers.register(late)
    expect(late.calls()).toBe(0)

    const second = refreshers.checkAll()
    await started()
    expect([first.calls(), late.calls()]).toEqual([1, 1])
    first.fail()
    late.answer()
    expect(await pull).toEqual(["first"])
    expect(await second).toEqual(["first"])

    // Once it answered, the next ask checks again.
    const third = refreshers.checkAll()
    await started()
    expect(first.calls()).toBe(2)
    first.answer()
    late.answer()
    expect(await third).toEqual([])
  })
})
