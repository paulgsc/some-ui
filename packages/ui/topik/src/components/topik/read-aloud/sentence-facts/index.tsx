/**
 * What the phone kept about the sentence on screen, one tap from its mark:
 * how often it was shown, when first and last, how often it was read to the
 * end, and why it is here (adaptive-learning canon Rem. 7.5). The facts are
 * what the screen showed, never how the learner did, and a stuck report is
 * not among them (Prop. 6.4 (iii)). The drill holds while this is open.
 */

import type { JSX } from "react"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import type { TallyRow } from "@topik/lib/topik/read-aloud/tally"
import { TALLY_WORDS } from "@topik/lib/topik/read-aloud/tally-words"

type SentenceFactsProps = {
  open: boolean
  row: TallyRow
  /** Why the sentence is on screen, where there is something to say. */
  why: string | null
  /** When the tally began (ISO), and the learner's local day. */
  since: string
  today: string
  /** False when the phone could not keep the tally. */
  kept: boolean
  onClose: () => void
}

export const SentenceFacts = ({
  open,
  row,
  why,
  since,
  today,
  kept,
  onClose,
}: SentenceFactsProps): JSX.Element => {
  const rows: Array<[string, string]> = [
    [TALLY_WORDS.labels.shown, TALLY_WORDS.shown(row)],
    [TALLY_WORDS.labels.first, TALLY_WORDS.date(row.first, today)],
    [TALLY_WORDS.labels.last, TALLY_WORDS.date(row.last, today)],
    [TALLY_WORDS.labels.read, TALLY_WORDS.read(row)],
  ]
  if (why !== null) rows.push([TALLY_WORDS.labels.why, why])
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        data-slot="read-aloud-facts"
        data-scroll-intent="long-form"
        className={
          // scroll-intent: long-form — a phone held sideways is too short for
          // the five facts and the button, so the sheet scrolls rather than clip.
          "max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pt-6 pb-8"
        }
      >
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-xl">{TALLY_WORDS.title}</SheetTitle>
          <SheetDescription className="text-foreground text-sm">
            {TALLY_WORDS.holding}
          </SheetDescription>
        </SheetHeader>
        <dl className="border-border mt-4 divide-y rounded-2xl border px-4">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <dt className="text-foreground shrink-0 text-xs font-medium tracking-wider uppercase">
                {label}
              </dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-foreground mt-3 text-sm leading-relaxed">
          {TALLY_WORDS.kept(since, today, kept)}
        </p>
        <Button className="mt-5 h-12 w-full rounded-2xl" onClick={onClose}>
          {TALLY_WORDS.done}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
