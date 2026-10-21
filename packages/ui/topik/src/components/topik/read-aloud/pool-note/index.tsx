import type { JSX } from "react"
import type { SentencePool } from "@topik/lib/topik/read-aloud/set-builder"
import {
  poolCount,
  poolFull,
  poolFullNote,
} from "@topik/lib/topik/read-aloud/sitting-words"

export const PoolNote = ({ pool }: { pool: SentencePool }): JSX.Element => (
  <p
    data-slot="read-aloud-pool-note"
    className="text-foreground text-sm leading-relaxed"
  >
    {poolFull(pool) ? poolFullNote(pool) : poolCount(pool)}
  </p>
)
