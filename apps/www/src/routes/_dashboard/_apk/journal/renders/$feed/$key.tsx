import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { RunAgainPage } from "@/components/studio/run-again"

/**
 * Studio › Renders › Run it again (RETRY): a render that couldn't finish,
 * its steps and the button to send it back in line. The page and its words
 * exist only in the Android app (`build.paths.ts`), as Renders does.
 */
const Page = (): JSX.Element | null => {
  const { feed, key } = Route.useParams()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    // Another row is another page, its tap's answer never said on this one.
    <RunAgainPage key={[feed, key].join("/")} feed={feed} rowKey={key} />
  ) : null
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/renders/$feed/$key"
)({
  params: {
    parse: ({ feed, key }): { feed: string; key: string } => ({ feed, key }),
    stringify: ({
      feed,
      key,
    }: {
      feed: string
      key: string
    }): { feed: string; key: string } => ({ feed, key }),
  },
  component: Page,
})
