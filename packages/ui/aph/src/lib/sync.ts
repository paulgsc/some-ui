/**
 * One exchange with home for aph kept on home (`home.ts`): the outbox sent,
 * home's record read back into the store. Over a `send` port the app hands
 * in (its home link, apps/www `lib/home-link`), so this package makes no
 * request of its own and knows no address. The routes are paulgsc/server's
 * `routes/aph.rs`.
 *
 * In order:
 *
 * 1. the settings, when they changed here (`PUT /aph/settings`): home checks
 *    entries against its settings, so an exchange whose settings home did
 *    not take ends there;
 * 2. each waiting entry, once (`PUT /aph/entries/:id`): home answers with
 *    the entry as it now holds it, and the store lets go of its own copy
 *    only when that is the same entry, still unchanged here. A `422` is the
 *    entry refused, with why, and kept on the phone;
 * 3. home's whole record (`GET /aph`), shown from then on.
 *
 * What an exchange learned is handed to the store as it ends, however it
 * ends: a throw part way (a stop, no answer) keeps what home already
 * confirmed, and everything else waiting.
 */
import { z } from "zod"

import type { Receipt } from "./home"
import type { AphStore } from "./store"
import { EntrySchema, HeldSchema, SettingsSchema } from "./stored"

/** A credentialed request to the paired home, at `path` under its API base. */
export type HomeCall = (
  method: "GET" | "PUT",
  path: string,
  body?: string
) => Promise<{ status: number; body: string }>

/** How an exchange that got its answers ended. */
export type Exchanged =
  /** Everything sendable sent, and home's record read and shown. */
  | { readonly kind: "synced" }
  /** Home answered `401`: it no longer knows this phone. */
  | { readonly kind: "forgotten" }
  /** Home answered something else, said in words. */
  | { readonly kind: "failed"; readonly why: string }

const EntryAnswer = z.object({ entry: EntrySchema })
const SettingsAnswer = z.object({ settings: SettingsSchema })
const Refusal = z.object({
  error: z.object({ details: z.record(z.string(), z.array(z.string())) }),
})

/** `text` as `schema` reads it, or null. */
function readAs<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const read = schema.safeParse(JSON.parse(text))
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** A `422`'s reasons, as "field why; field why". */
function refusalOf(body: string): string {
  const details = readAs(Refusal, body)?.error.details ?? {}
  const reasons = Object.entries(details).flatMap(([field, whys]) =>
    whys.map((why) => `${field} ${why}`)
  )
  return reasons.length > 0 ? reasons.join("; ") : "refused"
}

function unexpected(what: string, status: number): Exchanged {
  return { kind: "failed", why: `${what}: home answered ${status}` }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
/** A `Receipt`, filled in as an exchange goes. */
type Learned = {
  -readonly [K in keyof Receipt]: Mutable<Receipt[K]>
}

async function exchange(
  store: AphStore,
  send: HomeCall,
  learned: Learned
): Promise<Exchanged> {
  const box = store.outbox()
  if (box === null) return { kind: "synced" }

  if (box.settings !== null) {
    const answer = await send(
      "PUT",
      "/aph/settings",
      JSON.stringify(box.settings)
    )
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 422) {
      return {
        kind: "failed",
        why: `home refused the settings: ${refusalOf(answer.body)}`,
      }
    }
    const settings = readAs(SettingsAnswer, answer.body)?.settings ?? null
    if (answer.status !== 200 || settings === null) {
      return unexpected("the settings", answer.status)
    }
    learned.settings = settings
  }

  for (const entry of box.entries) {
    const answer = await send(
      "PUT",
      `/aph/entries/${encodeURIComponent(entry.id)}`,
      JSON.stringify(entry)
    )
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 422) {
      learned.refused.push({ entry, why: refusalOf(answer.body) })
      continue
    }
    const held = readAs(EntryAnswer, answer.body)?.entry ?? null
    if (answer.status !== 200 || held === null) {
      return unexpected("an entry", answer.status)
    }
    learned.held.push(held)
  }

  const answer = await send("GET", "/aph")
  if (answer.status === 401) return { kind: "forgotten" }
  const record = readAs(HeldSchema, answer.body)
  if (answer.status !== 200 || record === null) {
    return unexpected("the record", answer.status)
  }
  // First, so what home just took is no longer laid over its record.
  store.sent(learned)
  learned.held = []
  learned.refused = []
  learned.settings = null
  if (!store.pulled(record)) {
    return { kind: "failed", why: "home's record breaks one of aph's rules" }
  }
  return { kind: "synced" }
}

/** Steps 1 to 3 through `send`. Throws what `send` throws. */
export async function exchangeWithHome(
  store: AphStore,
  send: HomeCall
): Promise<Exchanged> {
  const learned: Learned = { settings: null, held: [], refused: [] }
  try {
    return await exchange(store, send, learned)
  } finally {
    const { settings, held, refused } = learned
    if (settings !== null || held.length > 0 || refused.length > 0) {
      store.sent(learned)
    }
  }
}
