/**
 * The Jobs record kept on home, wired (LA10, docs/learner-data-authority.md):
 * one runtime per page load over the app's home link (`./kept-runtime`), and
 * the shared watch (`./kept-watch`) for as long as the Jobs wing's layout
 * mounts `useJobsHome`.
 *
 * `lib/jobs` is the phone's alone, so only the Jobs screens import it: they
 * hand its record and its exchange in (`JobsKeeping`), and this module names
 * neither.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import { homeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { createKept } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"

export type { KeptState } from "./kept-model"

/** The Jobs record as this lane sees it, and one exchange with home over it. */
export type JobsKeeping = KeptRecord & {
  /** Its person's second press; false when the phone would not keep it. */
  keepOnHome: () => boolean
  exchange: (send: HomeCall) => Promise<HomeExchanged>
}

let home: Kept | null = null

/** One runtime per page load, over the first `jobs` handed in. */
function jobsHome(jobs: JobsKeeping): Kept {
  home ??= createKept({
    exchange: (send) => jobs.exchange(send),
    keep: (run) => homeLink().keep(run),
    paired: () => homeLink().getSnapshot().link.kind === "paired",
    now: Date.now,
  })
  return home
}

/** The watch, for as long as the Jobs wing is mounted. */
export function useJobsHome(jobs: JobsKeeping): void {
  useEffect(() => watchKept(jobs, jobsHome(jobs)), [jobs])
}

/** How keeping on home is going, for the Record view's strip. */
export function useJobsRun(jobs: JobsKeeping): KeptState {
  const current = jobsHome(jobs)
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}

/**
 * The opt-in's second press: the record is kept on home from now on. The
 * switch moves the record's revision, so the watch asks for the first run.
 */
export function keepJobsOnHome(jobs: JobsKeeping): boolean {
  return jobs.keepOnHome()
}

/** "Try now": asks for a run, as any moment the watch names would. */
export function askJobs(jobs: JobsKeeping): void {
  askKept(jobs, jobsHome(jobs), document)
}
