/**
 * What the week's screens keep on this phone (RR13), each in one
 * `localStorage` record read and written only through core-utils'
 * `openKept` and `writeKept` (KR1), so a value that can't be read whole is
 * moved aside, never written over (the draft and the weeks sent through
 * `@some-ui/voice-capture`'s `keptDrafts` and `keptRecords`):
 *
 * - **A draft per week** (`weekDrafts`): the bundle's draft of the week by
 *   its id, so a week left unsent stays as it was when the next one opens.
 *   It is written over freely: nothing in it has left the phone.
 * - **The weeks sent** (`weeksSent`), which only grow: a change that would
 *   drop or rewrite one already kept is refused.
 * - **The words home heard** in each take sent (`heardWords`), by take: a
 *   copy of home's, each kept once and never written over.
 * - **An error pasted** (`pasteStores`, `./paste`): the one being written in
 *   each week, kept as it is typed, and those kept, which only grow. Each
 *   one kept goes home (`lib/kept-home`, RR14), and stays here too.
 * - **The owner's picks at each fork** (`weekPicks`, RR29) and **each step
 *   marked done or skipped** (`weekMarks`, RR25), every week's in one list
 *   each, which only grow: a pick or a mark is appended, never written over
 *   (`lib/decisions`, `lib/flow`).
 */
import type { PickMade } from "@rust-rounds/lib/decisions"
import type { StepMark } from "@rust-rounds/lib/flow"
import { WEEK_SENT_KEY } from "@rust-rounds/lib/play/keys"
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  canonicalJson,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"
import type {
  BundleDraft,
  BundleDrafts,
  BundleRecords,
} from "@some-ui/voice-capture"
import { keptDrafts, keptRecords } from "@some-ui/voice-capture"
import { z } from "zod"

import type { WeekSent } from "./spec"

const DRAFTS_KEY = "some-ui:rust-rounds.week-drafts"
const HEARD_KEY = "some-ui:rust-rounds.week-heard"
const PASTE_DRAFTS_KEY = "some-ui:rust-rounds.week-paste-drafts"
const PASTES_KEY = "some-ui:rust-rounds.week-pastes"
const PICKS_KEY = "some-ui:rust-rounds.week-picks"
const MARKS_KEY = "some-ui:rust-rounds.week-marks"

/** The draft of week `week`, among every week's in `storage`. */
export const weekDrafts = (
  storage: KeyedStorage | null,
  week: string
): BundleDrafts<BundleDraft> => keptDrafts(storage, DRAFTS_KEY, week)

const SentSchema: z.ZodType<WeekSent> = z.object({
  week: z.string(),
  at: z.string(),
  answers: z.array(
    z.object({
      ticket: z.string(),
      point: z.number().int().positive().optional(),
      take: z.string(),
      recordedAt: z.string(),
    })
  ),
  passed: z.array(z.string()),
})

/** The weeks sent from this phone, in `storage`, which only grow. */
export const weeksSent = (
  storage: KeyedStorage | null
): BundleRecords<WeekSent> =>
  keptRecords(storage, WEEK_SENT_KEY, (value) => {
    const parsed = z.array(SentSchema).safeParse(value)
    return parsed.success ? parsed.data : null
  })

const readHeard = readJson((value) => {
  const parsed = z.record(z.string(), z.string()).safeParse(value)
  return parsed.success ? parsed.data : null
})

export type HeardWords = {
  /** The words kept, by take. */
  readonly read: () => Readonly<Partial<Record<string, string>>>
  /** Keeps `text` as `take`'s words, unless it has some; false when nothing changed. */
  readonly add: (take: string, text: string) => boolean
}

/** The words home heard in the takes sent, in `storage`. */
export function heardWords(storage: KeyedStorage | null): HeardWords {
  const open = (): {
    value: Readonly<Partial<Record<string, string>>>
    writable: boolean
  } => openKept(storage, HEARD_KEY, readHeard, {})
  return {
    read: () => open().value,
    add: (take, text): boolean => {
      const opened = open()
      if (!opened.writable || opened.value[take] !== undefined) return false
      return writeKept(
        storage,
        HEARD_KEY,
        { ...opened.value, [take]: text },
        readHeard
      )
    },
  }
}

/** A paste being written: the week it is in, when it was begun, its text. */
export type PasteDraft = {
  readonly week: string
  readonly at: string
  readonly text: string
}

/** A paste kept: its text, and the take of its note, if it has one. */
export type KeptPaste = PasteDraft & { readonly note: string | null }

const PasteDraftSchema: z.ZodType<PasteDraft> = z.object({
  week: z.string(),
  at: z.string(),
  text: z.string(),
})

const KeptPasteSchema: z.ZodType<KeptPaste> = z.object({
  week: z.string(),
  at: z.string(),
  text: z.string(),
  note: z.string().nullable(),
})

const readPasteDrafts = readJson((value) => {
  const parsed = z.record(z.string(), PasteDraftSchema).safeParse(value)
  return parsed.success ? parsed.data : null
})

const readPastes = readJson((value) => {
  const parsed = z.array(KeptPasteSchema).safeParse(value)
  return parsed.success ? parsed.data : null
})

export type PasteStores = {
  /** The paste being written in each week, by the week's id. */
  readonly draft: {
    /** Week `week`'s, or null for none (or one that can't be read). */
    readonly read: (week: string) => PasteDraft | null
    /** Sets week `week`'s, leaving every other week's as it is. */
    readonly write: (week: string, draft: PasteDraft | null) => boolean
  }
  readonly pastes: {
    readonly list: () => ReadonlyArray<KeptPaste>
    /**
     * Adds `paste` once to the pastes kept: true when it is kept, already
     * whole; false when not, or when another paste begun at the same instant
     * is kept already.
     */
    readonly add: (paste: KeptPaste) => boolean
  }
}

/** The pastes kept in `storage`. */
export function pasteStores(storage: KeyedStorage | null): PasteStores {
  const openPastes = (): {
    value: ReadonlyArray<KeptPaste>
    writable: boolean
  } => openKept(storage, PASTES_KEY, readPastes, [])
  const openDrafts = (): {
    value: Readonly<Partial<Record<string, PasteDraft>>>
    writable: boolean
  } => openKept(storage, PASTE_DRAFTS_KEY, readPasteDrafts, {})
  return {
    draft: {
      read(week): PasteDraft | null {
        const draft = openDrafts().value[week]
        return draft?.week === week ? draft : null
      },
      write(week, draft): boolean {
        const opened = openDrafts()
        if (!opened.writable) return false
        const { [week]: _gone, ...others } = opened.value
        const next = draft === null ? others : { ...others, [week]: draft }
        return writeKept(storage, PASTE_DRAFTS_KEY, next, readPasteDrafts)
      },
    },
    pastes: {
      list: () => openPastes().value,
      add(paste): boolean {
        const opened = openPastes()
        if (!opened.writable) return false
        const same = opened.value.find((each) => each.at === paste.at)
        if (same !== undefined) {
          return canonicalJson(same) === canonicalJson(paste)
        }
        return writeKept(
          storage,
          PASTES_KEY,
          [...opened.value, paste],
          readPastes
        )
      },
    },
  }
}

/** A kept record of week `week`'s. */
type OfWeek<R> = R & { readonly week: string }

/**
 * Week `week`'s records among every week's kept: what `lib/decisions` and
 * `lib/flow` read, since a ticket's id names it within its week only.
 */
export const ofWeek = <R>(
  records: ReadonlyArray<OfWeek<R>>,
  week: string
): ReadonlyArray<OfWeek<R>> => records.filter((each) => each.week === week)

const PickSchema: z.ZodType<OfWeek<PickMade>> = z.object({
  week: z.string(),
  ticket: z.string(),
  fork: z.number().int().positive(),
  pick: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("option"), option: z.string() }),
    z.object({ kind: z.literal("own") }),
  ]),
  at: z.string(),
})

/** Every pick made at a fork on this phone, each week's, which only grow. */
export const weekPicks = (
  storage: KeyedStorage | null
): BundleRecords<OfWeek<PickMade>> =>
  keptRecords(storage, PICKS_KEY, (value) => {
    const parsed = z.array(PickSchema).safeParse(value)
    return parsed.success ? parsed.data : null
  })

const MarkSchema: z.ZodType<OfWeek<StepMark>> = z.object({
  week: z.string(),
  ticket: z.string(),
  step: z.enum(["read", "academy", "voice"]),
  mark: z.enum(["done", "skipped"]),
  at: z.string(),
})

/** Every step marked done or skipped on this phone, each week's, which only grow. */
export const weekMarks = (
  storage: KeyedStorage | null
): BundleRecords<OfWeek<StepMark>> =>
  keptRecords(storage, MARKS_KEY, (value) => {
    const parsed = z.array(MarkSchema).safeParse(value)
    return parsed.success ? parsed.data : null
  })
