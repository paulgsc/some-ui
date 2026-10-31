import type { JSX } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { failed, idle } from "@some-ui/intent-kit"

import { IntentButton } from "@/lib/intent/render"

/** The words Practice Home showed on 2026-10-30, a non-retryable 4xx. */
const REFUSED: Intent<unknown> = failed(
  {
    kind: "rejected",
    retryable: false,
    summary: "That request couldn't be completed.",
    cause: null,
  },
  () => undefined
)

/** The row each state is drawn in: Practice Home's (`practice/index.tsx`). */
const ROWS: ReadonlyArray<{
  id: string
  next: Intent<unknown>
  menu: Intent<unknown>
}> = [
  { id: "idle", next: idle(), menu: idle() },
  { id: "menu-failed", next: idle(), menu: REFUSED },
  { id: "next-failed", next: REFUSED, menu: idle() },
  { id: "both-failed", next: REFUSED, menu: REFUSED },
]

/**
 * "Next lesson" and "Pick a portion" in every combination of idle and
 * refused, each row as Practice Home lays them out
 * (`../intent-failure-fit.spec.ts`). Inline styles for the frame: this
 * directory is outside www's Tailwind sources (style.context.ts); the
 * buttons' own classes are the ones the app ships.
 */
export const IntentFailureFixture = (): JSX.Element => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 24,
      maxWidth: 448,
      margin: "0 auto",
      padding: 32,
    }}
  >
    {ROWS.map((row) => (
      <div key={row.id} data-row={row.id} className="flex flex-wrap gap-2">
        <IntentButton
          state={row.next}
          onPress={() => undefined}
          idleLabel="Next lesson"
          workingLabel="Getting it ready..."
          size="sm"
          className="h-12 rounded-2xl px-6 text-base"
          failureOwnLine
        />
        <IntentButton
          state={row.menu}
          onPress={() => undefined}
          idleLabel="Pick a portion"
          workingLabel="Getting it ready..."
          size="sm"
          variant="outline"
          className="h-12 rounded-2xl px-6 text-base"
          failureOwnLine
        />
      </div>
    ))}
  </div>
)
