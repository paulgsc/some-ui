/**
 * What the phone keeps about each sentence shown, on the start screen, with
 * the one way to let it go (adaptive-learning canon Rem. 7.5): a first press
 * that asks, and a second, in the sheet that says what goes and what stays.
 * It is not offered during a sitting, and the practice record is not touched.
 */

import type { JSX } from "react"
import { useState } from "react"
import { Button, useConfirmSheet } from "@some-ui/shared"
import { TALLY_WORDS } from "@topik/lib/topik/read-aloud/tally-words"

type TallyClearProps = {
  /** How many sentences have a row, and when the tally began (ISO). */
  size: number
  since: string | null
  today: string
  /** Clear it; whether the phone cleared it. */
  onClear: () => boolean
}

export const TallyClear = ({
  size,
  since,
  today,
  onClear,
}: TallyClearProps): JSX.Element | null => {
  const { ask, sheet } = useConfirmSheet()
  const [outcome, setOutcome] = useState<"cleared" | "notCleared" | null>(null)
  const held = size > 0 && since !== null
  if (!held && outcome !== "cleared") return null
  const { clear } = TALLY_WORDS
  return (
    <div
      data-slot="read-aloud-tally"
      className="flex w-full max-w-xs flex-col items-center gap-1"
    >
      {held && (
        <>
          <p className="text-foreground text-sm leading-relaxed">
            {clear.kept(size, since, today)}
          </p>
          <Button
            variant="ghost"
            className="h-11 rounded-2xl px-4"
            aria-label={clear.askName}
            onClick={() =>
              ask({
                title: clear.title,
                description: clear.goes(size, since, today),
                confirm: clear.confirm,
                keep: clear.keep,
                onConfirm: () =>
                  setOutcome(onClear() ? "cleared" : "notCleared"),
              })
            }
          >
            {clear.ask}
          </Button>
        </>
      )}
      <p aria-live="polite" className="text-foreground min-h-5 text-sm">
        {outcome === null ? null : clear[outcome]}
      </p>
      {sheet}
    </div>
  )
}
