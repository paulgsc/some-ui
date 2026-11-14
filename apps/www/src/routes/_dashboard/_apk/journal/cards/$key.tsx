import type { JSX } from "react"
import { createFileRoute, notFound } from "@tanstack/react-router"

import { isEssayKey } from "@/lib/cards-essay-key"
import { CardsEssayPage } from "@/components/studio/cards-essay"

/**
 * A cards essay (CARDS7, #2979), opened from its row on Studio › Renders:
 * home's video of it, brought to the phone and played. The page and its
 * words exist only in the Android app (`build.paths.ts`), as Renders does.
 */
const Page = (): JSX.Element | null => {
  const { key } = Route.useParams()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <CardsEssayPage essayKey={key} />
  ) : null
}

export const Route = createFileRoute("/_dashboard/_apk/journal/cards/$key")({
  params: {
    parse: ({ key }): { key: string } => {
      if (!isEssayKey(key)) throw notFound()
      return { key }
    },
    stringify: ({ key }: { key: string }): { key: string } => ({ key }),
  },
  component: Page,
})
