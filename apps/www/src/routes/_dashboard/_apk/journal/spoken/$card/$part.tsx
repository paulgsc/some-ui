import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SpokenPartPage } from "@/components/studio/spoken"

// Spoken is the Android app's alone (`build.paths.ts`): other builds drop it.
const Part =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? SpokenPartPage : null

/** A part of a spoken card (W5): read or said, recorded, and its takes; `part` counts from 1. */
const PartPage = (): JSX.Element | null => {
  const { card, part }: { card: string; part: string } = Route.useParams()
  const n = /^[1-9]\d{0,2}$/u.test(part) ? Number(part) - 1 : -1
  return Part === null ? null : <Part id={card} n={n} />
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/spoken/$card/$part"
)({ component: PartPage })
