import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { stageSearch } from "@/lib/stage-search"
import { RustScreenStage } from "@/lib/web-surface"

/** A Rust Rounds ticket's card for the essay recorder (`RustScreenStage`). */
const RustScreen = (): JSX.Element => {
  const { week, ticket } = Route.useSearch()
  return <RustScreenStage week={week} ticket={ticket} />
}

export const Route = createFileRoute("/rust-screen")({
  validateSearch: stageSearch,
  component: RustScreen,
})
