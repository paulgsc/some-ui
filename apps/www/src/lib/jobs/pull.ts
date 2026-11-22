/**
 * What a pull on a Jobs screen reads again (PULL2, #2459): the morning
 * run's picks and home's record of its runs.
 *
 * JP1: it reads them through `askJobsPicks` alone, as Studio's screens read
 * theirs, never by waiting on a lane's run, which queues behind the drain.
 */
import { askJobsPicks } from "@/lib/home-link/jobs"
import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import { PULL_CHECKS } from "./words"

const jobsRefresher: Refresher = {
  what: PULL_CHECKS,
  checkAgain: async () => {
    const read = await askJobsPicks()
    // Not paired: there is nothing on home to check.
    if (read.kind === "unpaired") return
    if (read.kind !== "answered" || read.value !== null) {
      throw new Error("this morning's picks couldn't be read from home")
    }
  },
}

/** Adds the Jobs check to every pull while its screen shows; returns the drop. */
export const registerJobsPull = (): (() => void) =>
  screenRefreshers.register(jobsRefresher)
