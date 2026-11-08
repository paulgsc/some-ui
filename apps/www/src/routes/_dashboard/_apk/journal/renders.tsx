import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { RendersPage } from "@/components/studio/renders"

/**
 * Studio › Renders (SFEED13, #2761): what home is making, what waits for
 * room, and what's coming, from the line above Studio's tiles. The page and
 * its words exist only in the Android app (`build.paths.ts`), as Studio's
 * feed videos do.
 */
const Page: () => JSX.Element | null =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? RendersPage
    : (): null => null

export const Route = createFileRoute("/_dashboard/_apk/journal/renders")({
  component: Page,
})
