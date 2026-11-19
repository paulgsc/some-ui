import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { feedVideos, videosRefresher } from "@/lib/call-videos"
import { phoneInterviews } from "@/lib/interview-week"
import { ESSAY_FEED, pastWeeks } from "@/lib/interview-week/past"
import { interviewSent } from "@/lib/interview-week/store"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { rendersQuery } from "@/lib/renders"
import { browserLocalStorage } from "@/lib/tenant/storage"
import { PastWeeks } from "@/components/jobs/interview/past"

const essays = feedVideos(ESSAY_FEED)

/**
 * Past weeks (IW17): the weeks and sends this phone keeps, read once per
 * visit; the essays' feed, read on open as Studio's Episodes reads it; and
 * home's render board, as Studio › Renders reads it.
 */
const PhonePast = (): JSX.Element => {
  // Read once per visit, as the layout reads the week.
  const [kept] = useState(() => ({
    held: phoneInterviews().held().weeks,
    sent: interviewSent(browserLocalStorage).list() ?? [],
  }))
  const { list } = useSyncExternalStore(essays.subscribe, essays.getSnapshot)
  // Read on open, and again on a drag down while on screen, as Episodes reads it.
  useEffect(() => {
    void essays.open()
    return screenRefreshers.register(videosRefresher(ESSAY_FEED))
  }, [])
  const renders = useQuery(rendersQuery)
  const board = renders.data?.kind === "read" ? renders.data.board : null
  const at = new Date().toISOString()
  const weeks = pastWeeks(kept.held, kept.sent, at, list, board)
  const unknown = weeks.some(({ essay }) => essay.kind === "unknown")
  return (
    <PastWeeks
      weeks={weeks}
      askAgain={
        unknown && list.kind !== "reading"
          ? (): void => {
              void essays.open()
            }
          : null
      }
    />
  )
}

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Past = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <PhonePast /> : null

/** Past weeks (IW17): each closed week, and where its essay is. */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/past")({
  component: Past,
})
