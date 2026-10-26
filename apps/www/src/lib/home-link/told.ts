/**
 * Telling the paired home what its person chose (`PUT /sharing/:scope`,
 * paulgsc/server#433), so home keeps when each choice began and ended and
 * refuses what a stopped record's phone still sends. The phone's consent
 * log (`./consent-model`) stays the record of what was agreed to; home's
 * copy holds the scope and the moment, never the words.
 *
 * Each choice is told once, in the order made, for the pairing it was made
 * under, and remembered by its place in the log (`seq`, kept per pairing
 * like `./sent`'s bookkeeping). Lost, it only means telling again, which
 * home answers as unchanged. A home that keeps no choices (one before #433
 * answers `404`) is told nothing more that run, and, once it has answered
 * so twice in a row, nothing more until the app starts again. A home older
 * than a choice's scope (voice notes before paulgsc/server#472) answers it
 * `422` naming the scope: the choices after it are still told, and that one
 * and every later one stay untold, told again on each run until home takes
 * them (as unchanged, the ones it heard). The run goes on, since that home
 * refuses nothing under a scope it does not know.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { readAs, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

import { isRecord } from "@/lib/device-backend/common"

import type { ConsentLog, Scope } from "./consent-model"

const TOLD_KEY = "some-ui.home.told.v1"

type Store = Pick<Storage, "getItem" | "setItem"> | null

/** The last choice home heard under `pairing`, by its place in the log. */
export function readTold(storage: Store, pairing: string): number {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(TOLD_KEY) ?? "null")
    return isRecord(parsed) &&
      parsed.pairing === pairing &&
      typeof parsed.seq === "number"
      ? parsed.seq
      : 0
  } catch {
    return 0
  }
}

function rememberTold(storage: Store, pairing: string, seq: number): void {
  try {
    storage?.setItem(TOLD_KEY, JSON.stringify({ pairing, seq }))
  } catch {
    // Ignored: unwritten, the next run tells home again; home answers it unchanged.
  }
}

/** Each change home has not heard under `pairing`, in the order made. */
export function untold(
  log: ConsentLog,
  pairing: string,
  told: number
): Array<{ seq: number; scope: Scope; kept: boolean }> {
  return log.flatMap((event) =>
    event.pairing === pairing && event.seq > told
      ? event.scopes.map((scope) => ({
          seq: event.seq,
          scope,
          kept: event.kind === "kept",
        }))
      : []
  )
}

/** Home says it heard a stop this phone did not end: tell everything again. */
export function forgetTold(storage: Store, pairing: string): void {
  rememberTold(storage, pairing, 0)
}

/**
 * The pairing whose home answered it keeps no choices, twice in a row, for
 * this page load; and how many such answers each pairing has had in a row.
 */
let keepsNone: string | null = null
const misses = new Map<string, number>()

const ScopeRefused = z.object({
  error: z.object({ details: z.object({ scope: z.unknown() }) }),
})

/**
 * Tells home, through `send`, every choice under `pairing` it has not
 * heard. Throws what `send` throws when home does not answer; what was
 * told before it stays told.
 */
export async function tellHome(
  send: HomeCall,
  pairing: string,
  log: ConsentLog,
  storage: Store
): Promise<HomeExchanged> {
  if (keepsNone === pairing) return { kind: "synced" }
  const changes = untold(log, pairing, readTold(storage, pairing))
  /** A choice home did not know the scope of: nothing from it on is told. */
  let unknown = false
  for (const [i, { seq, scope, kept }] of changes.entries()) {
    const { status, body } = await send(
      "PUT",
      `/sharing/${scope}`,
      JSON.stringify({ kept })
    )
    if (status === 401) return { kind: "forgotten" }
    if (status === 404) {
      // One 404 may be a proxy's moment; two in a row is a home before #433.
      const missed = (misses.get(pairing) ?? 0) + 1
      misses.set(pairing, missed)
      if (missed >= 2) keepsNone = pairing
      return { kind: "synced" }
    }
    misses.delete(pairing)
    if (status === 422 && readAs(ScopeRefused, body) !== null) {
      unknown = true
      continue
    }
    if (status !== 200) return unexpectedAnswer("a choice", status)
    // An event's scopes go one request each: it is told once all of them are.
    if (!unknown && changes[i + 1]?.seq !== seq) {
      rememberTold(storage, pairing, seq)
    }
  }
  return { kind: "synced" }
}
