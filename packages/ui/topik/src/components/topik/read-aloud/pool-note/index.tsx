import type { JSX } from "react"
import type { SentencePool } from "@topik/lib/topik/read-aloud/set-builder"
import {
  poolCount,
  poolFull,
  poolFullNote,
} from "@topik/lib/topik/read-aloud/sitting-words"

/**
 * What a set's summary says of the sitting's sentences (Rem. 4.9): how many
 * different ones have been shown, or, once every one has been, that they
 * come back from here and which first. Nothing here says what was learned.
 */
export const PoolNote = ({ pool }: { pool: SentencePool }): JSX.Element => (
  <p
    data-slot="read-aloud-pool-note"
    className="text-foreground text-sm leading-relaxed"
  >
    {poolFull(pool) ? poolFullNote(pool) : poolCount(pool)}
  </p>
)
