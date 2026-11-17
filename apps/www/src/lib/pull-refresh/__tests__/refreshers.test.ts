/**
 * The refresh port (PULL1).
 *
 * **HERD2: nothing a pull waits on holds the pulls after it** (#3102, epic
 * #3100).
 *
 * - _Claim:_ a refresher's check (here) or the home pull's ask of its lanes
 *   (`lib/home-link/pull.ts`) out longer than a pull may take (`CHECK_MS`)
 *   no longer answers the pulls after it: the next pull asks afresh, so one
 *   that never settles leaves the page to refresh on the next pull, not on a
 *   restart; a pull lets the home link's hold away go before the page or
 *   any screen reads again (`before`); the screens that read home outside
 *   the query cache (Takes on home, Needs your attention, Ideas on home)
 *   read again on a pull while they show; a clip's frames home was away for
 *   are asked again on the next visit; and home's overload (`503
 *   service_overloaded` with a `Retry-After`) is home busy, waited out as a
 *   `429` is, never home away.
 * - _Family:_ a check that settles before, at or after `CHECK_MS`, or never;
 *   pulls landing before and after that time; the late answer settling
 *   before or after the fresh one; the page's reads and the screens' asked
 *   with a hold away standing; each such screen shown, read away or read,
 *   then pulled, and gone; a clip page visited again after an away read and
 *   after a whole one; home answering overload with or without a
 *   `Retry-After`, with its code or another, or with a body not its JSON.
 * - _Proof:_ the "(HERD2)" cases here, in `./reads.test.ts`,
 *   `lib/home-link/__tests__/pull.test.ts`,
 *   `lib/home-link/__tests__/runtime.test.ts` and
 *   `lib/studio-clips/__tests__/home.test.ts`; in `@some-ui/soundbites`,
 *   `lib/__tests__/refresh.test.ts` and `lib/library/__tests__/runtime.test.ts`.
 * - _Tolerance:_ a check asked afresh may run beside the one still out; a
 *   refresher whose own runtime dedupes (the home pull's lanes, HERD1) runs
 *   once, and any other twice at most.
 */
import { describe, expect, it, vi } from "vitest"

import { CHECK_MS } from "@/lib/pull-refresh/model"
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

  it("asks one refresher two screens registered once a pull, while either holds it (HERD1)", async () => {
    const refreshers = createRefreshers()
    const feed = held("the feed")
    const dropOne = refreshers.register(feed)
    const dropOther = refreshers.register(feed)
    const pulled = refreshers.checkAll()
    await started()
    expect(feed.calls()).toBe(1)
    feed.fail()
    expect(await pulled).toEqual(["the feed"])

    // One screen went: the other still holds it, so a pull asks it.
    dropOne()
    dropOne()
    const again = refreshers.checkAll()
    await started()
    expect(feed.calls()).toBe(2)
    dropOther()
    // Its screens all gone, its answer is stale and left out.
    expect(await again).toEqual([])
    expect(await refreshers.checkAll()).toEqual([])
    expect(feed.calls()).toBe(2)
  })

  it("asks afresh a refresher whose check has been out longer than a pull may take, dropping the late answer (HERD2)", async () => {
    let now = 0
    const refreshers = createRefreshers(() => now)
    const hung = held("the feed")
    refreshers.register(hung)
    const first = refreshers.checkAll()
    await started()
    expect(hung.calls()).toBe(1)
    now = CHECK_MS - 1
    void refreshers.checkAll()
    await started()
    expect(hung.calls()).toBe(1)
    now = CHECK_MS
    const fresh = refreshers.checkAll()
    await started()
    expect(hung.calls()).toBe(2)
    // Both answers come; each pull hears its own, and the next is asked anew.
    hung.answer()
    expect(await fresh).toEqual([])
    expect(await first).toEqual([])
  })
})
