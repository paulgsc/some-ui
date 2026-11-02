/**
 * What a pull on a Jobs screen reads again (PULL2, #2459): the morning
 * run's picks and its record, which reach this phone only by the jobs
 * lane's run (`./home`, steps 3 and 4). The pull of home asks that run
 * (`lib/home-link/pull`, PULL3); this names it, in Jobs' words, when it
 * didn't get in step.
 */
import { jobsLane } from "@/lib/home-link/jobs"
import { resynced } from "@/lib/home-link/kept-model"
import { pulledLane } from "@/lib/home-link/lanes"
import type { Refresher } from "@/lib/pull-refresh/refreshers"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

import { PULL_CHECKS } from "./words"

const jobsRefresher: Refresher = {
  what: PULL_CHECKS,
  checkAgain: async () => {
    const ended = await pulledLane(jobsLane)
    if (ended !== null && !resynced(ended)) {
      throw new Error("the jobs lane's run didn't get in step")
    }
  },
}

/** Adds the Jobs check to every pull while its screen shows; returns the drop. */
export const registerJobsPull = (): (() => void) =>
  screenRefreshers.register(jobsRefresher)
