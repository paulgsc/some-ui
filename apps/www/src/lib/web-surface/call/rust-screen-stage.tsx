import type { JSX } from "react"
import { TicketScreen } from "@some-ui/rust-rounds"

import { VIEWER_BUILD } from "@/lib/data-mode"

import { rustScreenSource } from "./feed"
import { StageRefused } from "./frame"
import { screenStageOf } from "./rust-screen-view"

/**
 * A Rust Rounds ticket's card as the phone draws it, at the phone's width,
 * for an essay to show (RR31, #3288; call C790): the week home handed the
 * recorder (`./feed`'s `rustScreenSource`), or with no week, or `sample`,
 * the sample week. Nothing on it answers a tap. The card names its parts
 * (`data-region`) and the recorder photographs it with them
 * (`tests/record/screens.ts`).
 */

export type RustScreenStageProps = {
  /** The week by its id, or "sample". */
  week?: string
  /** The ticket by its key; the week's first when absent. */
  ticket?: string
}

export const RustScreenStagePage = ({
  week,
  ticket,
}: RustScreenStageProps): JSX.Element | null => {
  const named = !VIEWER_BUILD && week !== undefined && week !== "sample"
  const read = rustScreenSource.useResource(
    ["rust-screen", week],
    week ?? "",
    undefined,
    { enabled: named, retry: false }
  )
  const state = screenStageOf({
    week,
    ticket,
    viewer: VIEWER_BUILD,
    read: { data: read.data, pending: read.isPending, failed: read.isError },
  })
  if (state.kind === "waiting") return null
  if (state.kind === "none")
    return (
      <StageRefused
        reason={state.problems.join("\n")}
        problems={state.problems}
      />
    )
  return (
    <main className="bg-background text-foreground min-h-screen">
      <TicketScreen held={state.held} ticket={state.ticket} />
    </main>
  )
}
