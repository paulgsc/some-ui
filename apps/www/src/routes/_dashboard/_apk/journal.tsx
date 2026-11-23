import type { JSX } from "react"
import { useEffect } from "react"
import {
  IDEAS_KEY,
  keptIdeasForHome,
  keptIdeaStore,
  phoneProjectStore,
  phoneStudioKeeping,
} from "@some-ui/soundbites"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { keepIdeas } from "@/lib/idea-keeping"
import { keepStudio } from "@/lib/studio-keeping"
import { keepUseStores, keptWhole } from "@/lib/take-uses"

/**
 * Studio's ideas and videos, for what uses each take (INUSE,
 * `lib/take-uses`): handed in when this route loads, before any page under
 * it asks. My data's kind route (`./settings/data/$kind.tsx`) hands the
 * same in; the first hand-in stands.
 */
// An `if` statement, which the route's code splitting keeps in both its
// chunks; an expression statement (`env && keep(...)`) it would drop.
if (import.meta.env.VITE_DEVICE_BACKEND === "true")
  keepUseStores({
    ideas: () => keptWhole(IDEAS_KEY, () => keptIdeaStore().list()),
    videos: () => phoneProjectStore().listWhole(),
    subscribe: (listener) => phoneProjectStore().subscribe(listener),
  })

/**
 * Every Studio page, whichever opens first: in the Android app, Studio's
 * store, log and rules go to the home link (`lib/studio-keeping`), and the
 * ideas sent whole go home (ST26, `lib/idea-keeping`), so a take recorded
 * in a sitting or a video Finish queued goes home however the page was
 * reached. The first hand-in stands, and a child's effect runs before this
 * one, so New idea's own reading stands where it opens first.
 */
const StudioLayout = (): JSX.Element => {
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    keepStudio(phoneStudioKeeping())
    keepIdeas({ forHome: keptIdeasForHome() })
  }, [])
  return <Outlet />
}

export const Route = createFileRoute("/_dashboard/_apk/journal")({
  component: StudioLayout,
})
