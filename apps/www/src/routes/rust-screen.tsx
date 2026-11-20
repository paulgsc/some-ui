import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { RustScreenStage } from "@/lib/web-surface"

/**
 * A Rust Rounds ticket's card as the phone draws it (RR31, #3288), for the
 * essay recorder to photograph: `?week` names the week by its id ("sample"
 * for the sample's, as with none), `?ticket` the ticket by its key.
 * Standalone, so no shell sits in the picture. Web only: the stage comes
 * through the web surface's door.
 */
const RustScreen = (): JSX.Element => {
  const { week, ticket } = Route.useSearch()
  return <RustScreenStage week={week} ticket={ticket} />
}

type RustScreenSearch = {
  readonly week?: string
  readonly ticket?: string
}

const word = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined

export const Route = createFileRoute("/rust-screen")({
  validateSearch: (search: Record<string, unknown>): RustScreenSearch => {
    const week = word(search.week)
    const ticket = word(search.ticket)
    return {
      ...(week === undefined ? {} : { week }),
      ...(ticket === undefined ? {} : { ticket }),
    }
  },
  component: RustScreen,
})
