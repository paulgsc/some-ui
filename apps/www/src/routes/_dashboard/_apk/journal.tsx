import type { JSX } from "react"
import { useEffect } from "react"
import {
  keptIdeasForHome,
  keptIdeaStore,
  phoneProjectStore,
  phoneStudioKeeping,
} from "@some-ui/soundbites"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { keepIdeas } from "@/lib/idea-keeping"
import { keepStudio } from "@/lib/studio-keeping"
import { keepUseStores } from "@/lib/take-uses"

/**
 * Every Studio page, whichever opens first: in the Android app, Studio's
 * store, log and rules go to the home link (`lib/studio-keeping`), and the
 * ideas sent whole go home (ST26, `lib/idea-keeping`), so a take recorded
 * in a sitting or a video Finish queued goes home however the page was
 * reached. The first hand-in stands, and a child's effect runs before this
 * one, so New idea's own reading stands where it opens first. Its ideas
 * and videos go to what tells each take's use (INUSE, `lib/take-uses`).
 */
const StudioLayout = (): JSX.Element => {
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    keepStudio(phoneStudioKeeping())
    keepIdeas({ forHome: keptIdeasForHome() })
    keepUseStores({
      ideas: () => keptIdeaStore().list(),
      videos: () => phoneProjectStore().list(),
      subscribe: (listener) => phoneProjectStore().subscribe(listener),
    })
  }, [])
  return <Outlet />
}

export const Route = createFileRoute("/_dashboard/_apk/journal")({
  component: StudioLayout,
})
