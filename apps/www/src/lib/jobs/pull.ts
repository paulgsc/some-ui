/**
 * What a pull on a Jobs screen reads again (PULL2, #2459): the morning
 * run's picks and home's record of its runs, read as the person's own read
 * of home (`lib/home-link/jobs`'s `askJobsPicks`), as Studio's screens read
 * theirs, so they come at the person's turn on the pace, ahead of the
 * drain's (JP1). The jobs lane's run waits its turn behind every lane
 * before it and sends what this phone keeps first, and on a slowed pace it
 * ends minutes after the pull has; the pull of home still asks it
 * (`lib/home-link/pull`, PULL3), for what waits to go.
 *
 * JP1: a pull on a Jobs screen reads home's picks through `askJobsPicks`
 * alone, never by waiting on a lane's run.
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
    if (read.kind !== "answered" || read.short !== null) {
      throw new Error("this morning's picks couldn't be read from home")
    }
  },
}

/** Adds the Jobs check to every pull while its screen shows; returns the drop. */
export const registerJobsPull = (): (() => void) =>
  screenRefreshers.register(jobsRefresher)
