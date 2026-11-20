import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SpokenPartPage } from "@/components/studio/spoken"

/** A part of a spoken card (W5): read or said, recorded, and its takes; `part` counts from 1. */
const PartPage = (): JSX.Element => {
  const { card, part }: { card: string; part: string } = Route.useParams()
  const n = /^\d{1,3}$/u.test(part) ? Number(part) - 1 : -1
  return <SpokenPartPage id={card} n={n} />
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/spoken/$card/$part"
)({ component: PartPage })
