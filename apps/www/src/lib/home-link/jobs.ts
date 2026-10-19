/**
 * The Jobs record's lane (LA10, docs/learner-data-authority.md): every event
 * home does not hold yet, sent by `exchangeJobs` (`lib/jobs/home`) through
 * the one wiring (`./lanes`). Its record moves with each event added on this
 * phone, or home's copy taken in by a phone whose log was empty. The phone
 * keeps its whole log either way, so stopping is only the choice.
 */
import { useSyncExternalStore } from "react"

import { phoneJobs } from "@/lib/jobs"
import { exchangeJobs } from "@/lib/jobs/home"
import { homeOutbox } from "@/lib/jobs/model"

import type { Lane, LaneCounts } from "./lanes"

export const jobsLane: Lane = {
  id: "jobs",
  scopes: ["jobs"],
  exchange: (send) => exchangeJobs(phoneJobs().keeping, send),
  revision: () => phoneJobs().getSnapshot().state.log.length,
  subscribe: (listener) => phoneJobs().subscribe(listener),
  useCounts: (): LaneCounts => {
    const jobs = phoneJobs()
    const { state } = useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    return {
      held: { jobs: state.home.held.length },
      refused: { jobs: state.home.refused.length },
      waiting: homeOutbox(state).length,
      away: null,
      hidden: 0,
      pulled: true,
      offered: state.log.length,
    }
  },
  keptBefore: () => phoneJobs().getSnapshot().state.home.kept,
}
