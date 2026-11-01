/**
 * The study list's "Let it go" in the Android app (LA8,
 * docs/learner-data-authority.md): the confirm, the tap and what the row
 * says after. On a paired phone the confirm says home keeps the session, and
 * the tap copies it home and lets the phone's copy go only once home holds
 * it as it is (`lib/home-link/study-let-go`); anything short of that keeps
 * it here, said in the row. On a phone known to be unpaired the confirm says
 * it can't be brought back, and the tap deletes it as it always did. Every
 * word is `lib/home-link/words`' `LET_GO`.
 *
 * Device build only, like this module (`build.paths.ts`): the route picks
 * `useHomeLetGo` behind an inline `import.meta.env.VITE_DEVICE_BACKEND ===
 * "true"`.
 */
import type { JSX, ReactNode } from "react"
import { matchIntent } from "@some-ui/intent-kit"
import { useConfirmSheet } from "@some-ui/shared"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { hostOf, useHomeLink } from "@/lib/home-link"
import type { LetGoEnd, LetGoPromise } from "@/lib/home-link/study-let-go"
import {
  leftPhone,
  letSessionGo,
  promiseOf,
} from "@/lib/home-link/study-let-go"
import { LET_GO } from "@/lib/home-link/words"
import { useAsyncIntent } from "@/lib/intent"
import { IntentFailure } from "@/lib/intent/render"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsKey } from "@/lib/tenant"

/** What a session row needs of "Let it go": the confirm, and what to show. */
export type LetGoControl = {
  /** Opens the confirm. */
  readonly ask: () => void
  /** The row's lines: working, why it stayed, or a failure to retry. */
  readonly lines: ReactNode
  /** The confirm sheet, rendered once in the row. */
  readonly sheet: ReactNode
}

export function useHomeLetGo(session: SessionRecord): LetGoControl {
  const { ask, sheet } = useConfirmSheet()
  const queryClient = useQueryClient()
  const link = useHomeLink()
  const host = link.link.kind === "paired" ? hostOf(link.link.base) : "home"
  const promise = promiseOf(link)
  // The promise travels with the tap: what the confirm said is what runs,
  // however the pairing moved while it was open.
  // Said from the flow, not an effect: the row unmounts once the list it
  // refreshes no longer holds the session.
  const letGo = useAsyncIntent(
    ({ id, promised }: { id: string; promised: LetGoPromise }) =>
      letSessionGo(id, promised, (end: LetGoEnd) => {
        if (end.kind === "kept-home") toast.success(LET_GO.ended(end, host))
        void queryClient.invalidateQueries({ queryKey: sessionsKey })
      }),
    { presentation: "interactive" }
  )

  const lines = matchIntent(letGo.state, {
    idle: (): JSX.Element | null => null,
    working: (): JSX.Element | null =>
      promise === "home" ? (
        <p className="text-muted-foreground text-sm" role="status">
          {LET_GO.working(host)}
        </p>
      ) : null,
    succeeded: (end): JSX.Element | null =>
      leftPhone(end) ? null : (
        <p className="text-destructive text-sm break-words" role="alert">
          {LET_GO.ended(end, host)}
        </p>
      ),
    failed: (error, retry): JSX.Element => (
      <IntentFailure error={error} onRetry={retry} />
    ),
  })

  return {
    ask: (): void => {
      const promised = promise
      ask({
        title: LET_GO.title,
        description: LET_GO.question(session.name, promised, host),
        confirm: LET_GO.confirm,
        onConfirm: () => letGo.start({ id: session.id, promised }),
      })
    },
    lines,
    sheet,
  }
}
