/**
 * My data's policy (MY-DATA MD2, #2476): what the page shows, from home's
 * answer and this phone's recordings, as plain values. Pure: `./runtime`
 * reads both, and `./words` says it.
 *
 * - **Home's side** is home's own count (paulgsc/server
 *   `GET /voice-notes/kept`, `voice_repo::kept`): each kind's recordings,
 *   their room, how many were set aside and since when, what reached home
 *   each week, and a kind's newest. Nothing is counted twice: a recording
 *   home holds is home's, wherever else a copy still sits.
 * - **This phone's side** is what home doesn't hold yet: each recording
 *   still here that home hasn't said it holds, going home while its copy
 *   waits and the phone is paired, otherwise only on this phone (as every
 *   screen's row says it, `lib/home-link/voice-copy`'s `voiceKept`).
 * - **Read only.** Nothing here sends, keeps or lets go of anything.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import { z } from "zod"

import type { VoiceOut } from "@/lib/voice-home/model"

/** What a recording was said for, as home names it. */
export type Of = VoiceOut["of"]

/** Every kind of recording home keeps, in home's order (`voice_repo::Of`). */
export const KINDS = [
  "reflection",
  "jobs",
  "scene",
  "game",
  "studio",
  "soundbite",
  "lens",
  "leetype",
  "rust-round",
] as const satisfies ReadonlyArray<Of>

export function isKind(name: string): name is Of {
  return KINDS.some((kind) => kind === name)
}

const Kept = z.object({
  kinds: z.array(
    z.object({
      of: z.enum(KINDS),
      notes: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
      setAside: z.number().int().nonnegative(),
      since: z.string(),
    })
  ),
  weeks: z.array(
    z.object({
      week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
    })
  ),
  notes: z
    .array(
      z.object({
        id: z.string(),
        recordedAt: z.string(),
        storedAt: z.string(),
        size: z.number().int().nonnegative(),
        setAsideAt: z.string().nullable(),
      })
    )
    .nullable(),
})

/** Home's answer, as the phone reads it. */
export type HomeKept = z.infer<typeof Kept>

/** What home said, or why it said nothing. */
export type HomeReading =
  | { readonly kind: "reading" }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** No answer, busy, or an answer the phone can't read. */
  | { readonly kind: "unreachable" }
  /** Home answered, without this read: it runs an older version. */
  | { readonly kind: "older" }
  | { readonly kind: "read"; readonly kept: HomeKept }

/** What home's answer to its read of what it keeps says (`lib/home-link/kept-read`). */
export function readKept(answer: HomeAnswer): HomeReading {
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreachable" }
  const kept = readAs(Kept, answer.body)
  return kept === null ? { kind: "unreachable" } : { kind: "read", kept }
}

/** One recording on this phone, as the page needs it. */
export type PhoneNote = {
  readonly id: string
  readonly of: Of
  /** When it was recorded, ISO 8601. */
  readonly at: string
  readonly bytes: number
  /** Home has said it holds it: it is counted on home's side. */
  readonly held: boolean
  /** Its copy waits to go home while the phone is paired. */
  readonly going: boolean
}

/** Where a recording is kept, as the page says it. */
export type Where = "home" | "aside" | "going" | "phone"

/** The order the parts of "where" are drawn and listed: furthest from home first. */
export const WHERE_ORDER: ReadonlyArray<Where> = [
  "phone",
  "going",
  "home",
  "aside",
]

/** One kind's line: how many, how much room, since when. */
export type KindLine = {
  readonly of: Of
  readonly notes: number
  readonly bytes: number
  /** The earliest recording's time, ISO 8601. */
  readonly since: string
  /** None of them is on home (as far as this page knows). */
  readonly phoneOnly: boolean
}

/** One week on the growth chart: what home kept by its end. */
export type GrowthWeek = {
  /** The week's Monday, `YYYY-MM-DD`. */
  readonly week: string
  /** Bytes home kept by the end of that week. */
  readonly bytes: number
}

export type Overview = {
  readonly home: HomeReading["kind"]
  /** Bytes of recordings home keeps; null until home answered. */
  readonly homeBytes: number | null
  /** Bytes of recordings on this phone home doesn't hold yet. */
  readonly phoneBytes: number
  /** How many recordings, on home and on this phone, counted once. */
  readonly recordings: number
  /** Kinds with any recording, the most room first. */
  readonly kinds: ReadonlyArray<KindLine>
  /** Home's room week by week, oldest first; empty until home answered. */
  readonly growth: ReadonlyArray<GrowthWeek>
  readonly where: Readonly<Record<Where, number>>
}

/** The most weeks the growth chart shows: a quarter. */
export const GROWTH_WEEKS = 13

const DAY_MS = 86_400_000

/** The Monday (UTC) of the week `at` falls in, `YYYY-MM-DD`. */
export function mondayOf(at: Date): string {
  const day = (at.getUTCDay() + 6) % 7
  const monday = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) -
      day * DAY_MS
  )
  return monday.toISOString().slice(0, 10)
}

const weekAfter = (week: string): string =>
  new Date(Date.parse(`${week}T00:00:00Z`) + 7 * DAY_MS)
    .toISOString()
    .slice(0, 10)

/**
 * Home's room at the end of each week, from what reached it each week, up
 * to the week of `now`: at most `GROWTH_WEEKS`, the room before them
 * carried in, and a week nothing arrived drawn level.
 */
export function growthOf(
  weeks: HomeKept["weeks"],
  now: Date
): ReadonlyArray<GrowthWeek> {
  const first = weeks.at(0)
  if (first === undefined) return []
  const arrived = new Map(weeks.map((w) => [w.week, w.bytes]))
  const last = mondayOf(now)
  const all: Array<GrowthWeek> = []
  let total = 0
  for (let week = first.week; week <= last; week = weekAfter(week)) {
    total += arrived.get(week) ?? 0
    all.push({ week, bytes: total })
  }
  return all.slice(-GROWTH_WEEKS)
}

const earlier = (a: string, b: string): string =>
  Date.parse(a) <= Date.parse(b) ? a : b

/** What the page shows, from home's reading and this phone's recordings. */
export function overviewOf(
  home: HomeReading,
  phone: ReadonlyArray<PhoneNote>,
  now: Date
): Overview {
  const kept = home.kind === "read" ? home.kept : null
  const waiting = phone.filter((note) => !note.held)
  const lines = new Map<Of, KindLine>()
  for (const kind of kept?.kinds ?? [])
    lines.set(kind.of, {
      of: kind.of,
      notes: kind.notes,
      bytes: kind.bytes,
      since: kind.since,
      phoneOnly: false,
    })
  for (const note of waiting) {
    const line = lines.get(note.of)
    lines.set(
      note.of,
      line === undefined
        ? {
            of: note.of,
            notes: 1,
            bytes: note.bytes,
            since: note.at,
            phoneOnly: true,
          }
        : {
            ...line,
            notes: line.notes + 1,
            bytes: line.bytes + note.bytes,
            since: earlier(line.since, note.at),
          }
    )
  }
  const onHome = (kept?.kinds ?? []).reduce((n, k) => n + k.notes, 0)
  const aside = (kept?.kinds ?? []).reduce((n, k) => n + k.setAside, 0)
  const going = waiting.filter((note) => note.going).length
  return {
    home: home.kind,
    homeBytes:
      kept === null ? null : kept.kinds.reduce((n, k) => n + k.bytes, 0),
    phoneBytes: waiting.reduce((n, note) => n + note.bytes, 0),
    recordings: onHome + waiting.length,
    kinds: [...lines.values()].sort(
      (a, b) => b.bytes - a.bytes || KINDS.indexOf(a.of) - KINDS.indexOf(b.of)
    ),
    growth: kept === null ? [] : growthOf(kept.weeks, now),
    where: {
      home: onHome - aside,
      aside,
      going,
      phone: waiting.length - going,
    },
  }
}

/** One recording in a kind's list. */
export type KindItem = {
  readonly id: string
  /** When it was recorded, ISO 8601. */
  readonly at: string
  readonly bytes: number
  readonly where: Where
  /** Its audio is on this phone, so it plays here. */
  readonly playable: boolean
}

export type KindView = {
  readonly of: Of
  readonly home: HomeReading["kind"]
  /** Every recording of the kind, on home and on this phone, counted once. */
  readonly notes: number
  readonly bytes: number
  /** The earliest's time, ISO 8601; null when there are none. */
  readonly since: string | null
  /** Newest first: home's newest and every one on this phone. */
  readonly items: ReadonlyArray<KindItem>
}

/**
 * Kind `of`'s list, from home's reading and this phone's recordings. Home's
 * list is read only when it was asked for `of` (`listed`): one asked for
 * another kind is not this one's.
 */
export function kindOf(
  of: Of,
  listed: Of | null,
  home: HomeReading,
  phone: ReadonlyArray<PhoneNote>,
  now: Date
): KindView {
  const line = overviewOf(home, phone, now).kinds.find((k) => k.of === of)
  const mine = phone.filter((note) => note.of === of)
  const here = new Set(mine.map((note) => note.id))
  const fromHome: ReadonlyArray<KindItem> =
    home.kind === "read" && listed === of
      ? (home.kept.notes ?? []).map((note) => ({
          id: note.id,
          at: note.recordedAt,
          bytes: note.size,
          where: note.setAsideAt === null ? "home" : "aside",
          playable: here.has(note.id),
        }))
      : []
  const onList = new Set(fromHome.map((item) => item.id))
  const fromPhone: ReadonlyArray<KindItem> = mine
    .filter((note) => !note.held && !onList.has(note.id))
    .map((note) => ({
      id: note.id,
      at: note.at,
      bytes: note.bytes,
      where: note.going ? "going" : "phone",
      playable: true,
    }))
  return {
    of,
    home: home.kind,
    notes: line?.notes ?? 0,
    bytes: line?.bytes ?? 0,
    since: line?.since ?? null,
    items: [...fromHome, ...fromPhone].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at)
    ),
  }
}
