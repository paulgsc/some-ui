import type { JSX } from "react"
import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { homeHoldsInterviewSend } from "@/lib/home-link/interview"
import { onHomeHeard } from "@/lib/home-link/rust-kept"
import { ideaHome } from "@/lib/idea-hearing"
import { phoneInterviewPorts } from "@/lib/interview-week"
import {
  InterviewWeekScreen,
  NoInterviewWeek,
} from "@/components/jobs/interview"

/**
 * The interview week (IW5, #2936), the Jobs wing's fourth view (C396): the
 * week open now among those this phone holds from home, its brief, a card per
 * question and per read, a take each, looked over and sent home together.
 *
 * Its ports reach home in one way only: whether home is in reach, read from
 * the voice lane's last run (`ideaHome`). Whether home holds a send is read
 * from what the link last heard (`homeHoldsInterviewSend`), never asked of
 * home. The Jobs lane brings the weeks and takes the sends
 * (`lib/home-link/interview`).
 */
const PhoneInterview = (): JSX.Element => {
  // Made once per mount: the week is read once.
  const [ports] = useState(() =>
    phoneInterviewPorts({
      home: ideaHome,
      homeHolds: homeHoldsInterviewSend,
      onHomeHolds: onHomeHeard,
    })
  )
  return ports === null ? (
    <NoInterviewWeek />
  ) : (
    <InterviewWeekScreen ports={ports} />
  )
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the
 * week's storage and microphone (vite-env.d.ts, VITE_DEVICE_BACKEND).
 */
const InterviewRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhoneInterview /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/interview")({
  component: InterviewRoute,
})
