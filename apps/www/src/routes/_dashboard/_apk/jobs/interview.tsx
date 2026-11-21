import type { JSX } from "react"
import { useState } from "react"
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"

import { usePlace } from "@/lib/engagement-places"
import { homeHoldsInterviewSend } from "@/lib/home-link/interview"
import { onHomeHeard } from "@/lib/home-link/rust-kept"
import { askWeekRecord } from "@/lib/home-link/week-record"
import { ideaHome } from "@/lib/idea-hearing"
import { phoneInterviewPorts } from "@/lib/interview-week"
import { interviewPlaceOf } from "@/lib/interview-week/places"
import { INTERVIEW_PLACES } from "@/lib/jobs/offers"
import {
  InterviewWeekRuntime,
  NoInterviewWeek,
} from "@/components/jobs/interview/run"

/**
 * The interview week (IW5, #2936; IW8, #3175), the Jobs wing's fourth view
 * (C396): the week open now among those this phone holds from home. Each of
 * its pages is a route under this one, so Android's back steps through
 * them; this layout holds the week's one runtime while any of them is up.
 *
 * Its ports reach home in one way only: whether home is in reach, read from
 * the voice lane's last run (`ideaHome`). Whether home holds a send is read
 * from what the link last heard (`homeHoldsInterviewSend`), and a closed
 * week asks home's own record what was sent (`askWeekRecord`, RR30), once
 * each opening. The Jobs lane brings the weeks and takes the sends
 * (`lib/home-link/interview`).
 */
const PhoneInterview = (): JSX.Element => {
  // Which of the week's pages is up, for ENGAGE (WALK5, C861).
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  usePlace(INTERVIEW_PLACES, interviewPlaceOf(pathname))
  // Made once per mount: the week is read once.
  const [ports] = useState(() =>
    phoneInterviewPorts({
      home: ideaHome,
      homeHolds: homeHoldsInterviewSend,
      onHomeHolds: onHomeHeard,
      homeSent: (week) => askWeekRecord("interview-weeks", week),
    })
  )
  return ports === null ? (
    <NoInterviewWeek />
  ) : (
    <InterviewWeekRuntime ports={ports}>
      <Outlet />
    </InterviewWeekRuntime>
  )
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the
 * week's storage and microphone (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const InterviewLayout = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhoneInterview /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/interview")({
  component: InterviewLayout,
})
