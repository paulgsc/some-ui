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
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { readAs, refusalOf, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

import type { HomeHeld, Receipt } from "./home"
import type { AphStore } from "./store"
import { EntrySchema, HeldSchema, SettingsSchema } from "./stored"

const EntryAnswer = z.object({ entry: EntrySchema })
const SettingsAnswer = z.object({ settings: SettingsSchema })

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
/** A `Receipt`, filled in as an exchange goes. */
type Learned = {
  -readonly [K in keyof Receipt]: Mutable<Receipt[K]>
}

/** Home's whole record (`GET /aph`), or how reading it ended. */
async function readHome(send: HomeCall): Promise<HomeHeld | HomeExchanged> {
  const answer = await send("GET", "/aph")
  if (answer.status === 401) return { kind: "forgotten" }
  const record = readAs(HeldSchema, answer.body)
  if (answer.status !== 200 || record === null) {
    return unexpectedAnswer("the record", answer.status)
  }
  return record
}

async function exchange(
  store: AphStore,
  send: HomeCall,
  learned: Learned
): Promise<HomeExchanged> {
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
      return unexpectedAnswer("the settings", answer.status)
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
      return unexpectedAnswer("an entry", answer.status)
    }
    learned.held.push(held)
  }

  const record = await readHome(send)
  if ("kind" in record) return record
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
): Promise<HomeExchanged> {
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

/**
 * Once its person stops sending: home's record read once (`GET /aph`), and,
 * while `stopped` still holds once read, aph kept on this phone from it,
 * with what still waited here laid over it (`leaveHome`). Nothing is sent.
 * Throws what `send` throws, leaving aph where it was.
 */
export async function bringBack(
  store: AphStore,
  send: HomeCall,
  stopped: () => boolean
): Promise<HomeExchanged> {
  if (store.where().kind === "device") return { kind: "synced" }
  const record = await readHome(send)
  if ("kind" in record) return record
  if (!stopped()) return { kind: "synced" }
  return store.leaveHome(record)
    ? { kind: "synced" }
    : { kind: "failed", why: "this phone couldn't keep home's record" }
}
