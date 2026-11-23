/**
 * What Studio's Spoken keeps on this phone (W5, C806): every pasted spoken
 * card, newest first, through core-utils' `openKept`/`writeKept` (KR1), so a
 * record this build can't read is set aside, never overwritten. A card is
 * never let go here: its parts' takes are the owner's record (SCR1).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openKept, readJson, writeKept } from "@some-ui/core-utils"
import { SPOKEN_CATEGORIES } from "@some-ui/video-render"
import { z } from "zod"

import type { SpokenCard } from "./model"

export const SCRIPTS_KEY = "some-ui:studio-spoken"

const PartSchema = z.object({
  id: z.string().nullable(),
  kind: z.enum(["read", "own"]),
  ask: z.string().nullable(),
  text: z.string(),
  takes: z.array(z.string()),
  using: z.string().nullable(),
})

const CardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(SPOKEN_CATEGORIES),
  pastedAt: z.string(),
  parts: z.array(PartSchema),
})

const readScripts = readJson((value) => {
  const parsed = z.array(CardSchema).safeParse(value)
  return parsed.success ? parsed.data : null
})

export type SpokenStore = {
  readonly read: () => ReadonlyArray<SpokenCard>
  /**
   * The cards, or null when this phone can't read them whole: what a card
   * picks is then unknown, never none (`lib/take-uses`, TU1).
   */
  readonly known: () => ReadonlyArray<SpokenCard> | null
  /** Says whether this phone kept it. */
  readonly write: (scripts: ReadonlyArray<SpokenCard>) => boolean
}

export function spokenStore(storage: KeyedStorage | null): SpokenStore {
  return {
    read: () => openKept(storage, SCRIPTS_KEY, readScripts, []).value,
    known: (): ReadonlyArray<SpokenCard> | null => {
      const kept = openKept(storage, SCRIPTS_KEY, readScripts, [])
      return kept.writable ? kept.value : null
    },
    write: (scripts) => writeKept(storage, SCRIPTS_KEY, scripts, readScripts),
  }
}
