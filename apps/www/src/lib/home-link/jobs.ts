/**
 * The Jobs record's lane (LA15, docs/learner-data-authority.md): every event
 * home does not hold yet, sent by `exchangeJobs` (`lib/jobs/home`) through
 * the one wiring (`./lanes`), which also takes in the digests home holds for
 * days the phone does not. Its record moves with each event added on this
 * phone, or home's copy taken in by a phone whose log was empty, and while a
 * notice token is owed to home (`lib/jobs/notice`); a digest taken in does
 * not move it. The phone keeps its whole log either way.
 *
 * Once the record is synced, the interview week runs in the same lane
 * (`./interview`, IW5): its weeks come from home, and each week sent goes
 * home. A week sent moves the record; it goes at the lane's next run.
 */
import { useSyncExternalStore } from "react"
import type { HomeExchanged } from "@some-ui/core-utils"
import { fnv1a } from "@some-ui/core-utils"

import { interviewGoing } from "@/lib/interview-week/home"
import { phoneJobs } from "@/lib/jobs"
import { readDigests } from "@/lib/jobs/home"
import { homeOutbox } from "@/lib/jobs/model"
import { noticeFiling } from "@/lib/jobs/notice"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { homeLink, usePairing } from "./index"
import { exchangeJobsLane, interviewCounts } from "./interview"
import type { Lane, LaneCounts } from "./lanes"
import { fingerprintOf, sentUnder } from "./sent"
import type { NotAnswered } from "./while-busy"
import { answered, askWhileBusy } from "./while-busy"

export const jobsLane: Lane = {
  id: "jobs",
  exchange: (send, { pairing }) => exchangeJobsLane(send, pairing),
  // The log's length doubled, so a notice filing coming owed or settling
  // never lands on the value of another log length; then each interview
  // week's send going, as it is.
  revision: () => {
    const { state } = phoneJobs().getSnapshot()
    const log =
      state.log.length * 2 + (noticeFiling(state.home.notice) === null ? 0 : 1)
    return fnv1a(
      [
        String(log),
        ...interviewGoing(browserLocalStorage, Date.now()).map(
          (item) => `${item.id}@${fingerprintOf(item.wire)}`
        ),
      ].join("|")
    )
  },
  subscribe: (listener) => phoneJobs().subscribe(listener),
  useCounts: (): LaneCounts => {
    const jobs = phoneJobs()
    const { state } = useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    // Read again whenever a run ends, which is when home's answers land.
    const pairing = usePairing()
    const interview = interviewCounts(
      interviewGoing(browserLocalStorage, Date.now()),
      sentUnder(browserLocalStorage, pairing)
    )
    return {
      held: {
        jobs: state.home.held.length,
        interviewWeeks: interview.held,
      },
      refused: { jobs: state.home.refused.length },
      waiting: homeOutbox(state).length + interview.waiting,
      hidden: 0,
      pulled: true,
    }
  },
}

/**
 * A pull on a Jobs screen's read of this morning's picks and home's record
 * of the runs (`lib/jobs/pull`, JP1): `readDigests`' two `GET`s, as the
 * person's own read of home, ahead of the drain's turns on the pace.
 */
export const askJobsPicks = (): Promise<
  | { readonly kind: "answered"; readonly value: HomeExchanged | null }
  | NotAnswered
> =>
  askWhileBusy(() =>
    answered(
      () => homeLink().keep((send) => readDigests(phoneJobs().keeping, send)),
      (value) => ({ kind: "answered" as const, value })
    )
  )
