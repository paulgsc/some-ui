/**
 * The Jobs record kept on home (LA10, docs/learner-data-authority.md): the
 * wing's watch, which its layout mounts, and the Record view's strip, through
 * the shared one (`components/keep-on-home.tsx`). Phone-only
 * (`build.paths.ts`).
 */
import type { JSX } from "react"
import type { HomeExchanged } from "@some-ui/core-utils"
import { counted } from "@some-ui/core-utils"

import type { JobsKeeping } from "@/lib/home-link/jobs"
import {
  askJobs,
  keepJobsOnHome,
  useJobsHome,
  useJobsRun,
} from "@/lib/home-link/jobs"
import { phoneJobs } from "@/lib/jobs"
import { exchangeJobs } from "@/lib/jobs/home"
import { homeOutbox } from "@/lib/jobs/model"
import { KeepOnHome } from "@/components/keep-on-home"

import { useJobs } from "./parts"

let keeping: JobsKeeping | null = null

/** The phone's Jobs record as the home lane sees it, made once. */
function jobsKeeping(): JobsKeeping {
  if (keeping === null) {
    const jobs = phoneJobs()
    keeping = {
      kept: (): boolean => jobs.getSnapshot().state.home.kept,
      size: (): number => jobs.getSnapshot().state.log.length,
      subscribe: jobs.subscribe,
      keepOnHome: jobs.keepOnHome,
      exchange: (send): Promise<HomeExchanged> =>
        exchangeJobs(jobs.keeping, send),
    }
  }
  return keeping
}

/** Asks for a run at each moment LA10 names, while the wing is open. */
export const JobsHomeWatch = (): null => {
  useJobsHome(jobsKeeping())
  return null
}

export const JobsKeepOnHome = (): JSX.Element => {
  const { state } = useJobs()
  const run = useJobsRun(jobsKeeping())
  const { home } = state
  return (
    <KeepOnHome
      label="Where the Jobs record is kept"
      name="the record"
      run={run}
      kept={
        home.kept
          ? {
              waiting: homeOutbox(state).length,
              more: (host) =>
                home.refused.length > 0
                  ? [
                      `${host} refused ${counted(home.refused.length, "event")}, kept here: ${home.refused[0]?.why ?? ""}`,
                    ]
                  : [],
            }
          : null
      }
      offer={(host) =>
        `Send ${counted(state.log.length, "event")} to ${host}, and keep a copy there from now on? This phone keeps its whole record too, and syncs while Jobs is open. Voice notes stay on the phone and in Drive.`
      }
      keep={() => keepJobsOnHome(jobsKeeping())}
      ask={() => askJobs(jobsKeeping())}
    />
  )
}
