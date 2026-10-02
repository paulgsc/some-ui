/**
 * Copy the sessions on this device into the account, when the person says so.
 *
 * ## What this replaced, and why
 *
 * Sessions used to move on their own: the first call after a sign-in uploaded
 * everything in `localStorage` to whichever account signed in first, with no
 * prompt. On a shared browser that put one person's history in another's
 * account, and there is no way to take it back (the server mints the ids and
 * nothing here deletes remotely). Nothing moves now unless a person pressed a
 * button that named what would be sent and where (`components/settings`), and
 * invariant LA2 (`docs/learner-data-authority.md`) says so: only
 * `copyDeviceSessions` starts a transfer, and only that button's action calls
 * it.
 *
 * ## One person's choice, per account
 *
 * The browser never learns an account's id (the session is an `HttpOnly`
 * cookie and `/auth/session` reports only an expiry), so "already copied to
 * *this* account" cannot be a flag. The receipt records, for each device
 * session, the ids the server minted for its copies. To decide whether a
 * session is already in the account being used *now*, it asks that account:
 * `GET /sessions/:id` answers 404 for a session another account holds, the same
 * as for one that does not exist. So a second press for the same account
 * copies nothing, and a press under another account copies again, which is
 * what that person asked for.
 *
 * ## Resumable, and never duplicating
 *
 * There is no import endpoint. A session is created and then patched back into
 * shape, so the server's copy exists in two steps and the second can fail. The
 * receipt is written after the first (`complete: false`) and again after the
 * second. A retry finishes an incomplete copy rather than creating another.
 *
 * ## Under one authority
 *
 * The transfer runs under the authority it started in and checks it before each
 * call. A sign-out, a switch or another account signing in ends it with the
 * work done so far recorded (`stale`), and the account transport it uses
 * refuses to send after the change in any case.
 *
 * ## The device keeps its copies
 *
 * Nothing is deleted locally. If a copy was wrong in some way nobody noticed for
 * a week, the original is still there.
 */

import type { Authority } from "@/lib/authority"
import { authority, StaleAuthorityError } from "@/lib/authority"
import { createFileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import type { SessionsStore } from "@/lib/tenant/sessions-repository"
import { STORAGE_KEY } from "@/lib/tenant/sessions-repository"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { browserLocalStorage, readJSON, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

/** Versioned alongside the store it describes, so a change is a new key. */
const RECEIPT_KEY = "some-ui.tenant.sessions.transfers.v1"

type Copy = {
  /** The id the server minted. */
  readonly remoteId: string
  /** The second step (restoring status and times) landed too. */
  readonly complete: boolean
}

/** Device session id -> every copy ever made of it, in any account. */
type Receipt = Record<string, Array<Copy>>

function readReceipt(storage: StorageAdapter): Receipt {
  const stored = readJSON<Receipt | null>(storage, RECEIPT_KEY, null)
  // A fresh object each time: callers write into it.
  return typeof stored === "object" && stored !== null ? { ...stored } : {}
}

export type TransferPlan = {
  /** On the device and nowhere in this account yet. */
  readonly create: ReadonlyArray<SessionRecord>
  /** Started in this account by an earlier try and never finished. */
  readonly finish: ReadonlyArray<{
    readonly session: SessionRecord
    readonly remoteId: string
  }>
  /** On the device and already complete in this account. */
  readonly alreadyThere: number
}

/** What a person is asked about before anything is sent. */
export type TransferPreview = {
  /** Sessions a press would send. */
  readonly toCopy: number
  readonly alreadyThere: number
}

export type TransferOutcome =
  | { readonly kind: "copied"; readonly copied: number }
  /** Some landed, some did not; pressing again carries on where this stopped. */
  | {
      readonly kind: "partial"
      readonly copied: number
      readonly remaining: number
      readonly error: unknown
    }
  /** The authority changed mid-way. What was done is recorded; nothing more was sent. */
  | { readonly kind: "stale"; readonly copied: number }
  | { readonly kind: "not-on-account" }

export type TransferDeps = {
  storage?: StorageAdapter
  /** The account's store for the authority a transfer began under. `null`: nothing to talk to. */
  remote?: (token: Authority) => SessionsStore | null
}

function defaultRemote(token: Authority): SessionsStore | null {
  if (token.kind !== "account") return null
  const transport = createFileHostTransport("account")
  return transport ? createHttpSessionsRepository(transport) : null
}

/**
 * What the account does and does not already hold of the device's sessions.
 * Asks the account about each session this browser has copied before, and
 * nothing else.
 */
export async function planTransfer(
  remote: SessionsStore,
  storage: StorageAdapter,
  isCurrent: () => boolean = () => true
): Promise<TransferPlan> {
  const local = readJSON<Array<SessionRecord>>(storage, STORAGE_KEY, [])
  const receipt = readReceipt(storage)
  const create: Array<SessionRecord> = []
  const finish: Array<{ session: SessionRecord; remoteId: string }> = []
  let alreadyThere = 0

  for (const session of local) {
    let unfinished: string | null = null
    let complete = false
    for (const copy of receipt[session.id] ?? []) {
      if (!isCurrent()) throw new StaleAuthorityError("a transfer")
      if ((await remote.get(copy.remoteId)) === null) continue
      if (copy.complete) {
        complete = true
        break
      }
      unfinished ??= copy.remoteId
    }
    if (complete) alreadyThere += 1
    else if (unfinished !== null) finish.push({ session, remoteId: unfinished })
    else create.push(session)
  }
  return { create, finish, alreadyThere }
}

/** Restores everything `create` is not allowed to accept, in one patch. */
function restoration(
  session: SessionRecord
): Parameters<SessionsStore["update"]>[1] {
  // `status` and the stamps are what the nudge policy reads; dropping them
  // would make a copied history invisible to it. `totalDurationMs` is a value
  // the device already stored, copied as it was, not one this computes.
  return {
    status: session.status,
    totalDurationMs: session.totalDurationMs,
    ...(session.layout === undefined ? {} : { layout: session.layout }),
    ...(session.startedAt === undefined
      ? {}
      : { startedAt: session.startedAt }),
    ...(session.completedAt === undefined
      ? {}
      : { completedAt: session.completedAt }),
    ...(session.finalElapsedMs === undefined
      ? {}
      : { finalElapsedMs: session.finalElapsedMs }),
  }
}

/**
 * Send what `plan` says is missing. Progress is written after each step, which
 * is the whole duplicate guard: a run that stops anywhere resumes there.
 */
export async function runTransfer(
  plan: TransferPlan,
  remote: SessionsStore,
  storage: StorageAdapter,
  isCurrent: () => boolean = () => true
): Promise<Exclude<TransferOutcome, { kind: "not-on-account" }>> {
  const receipt = readReceipt(storage)
  const total = plan.create.length + plan.finish.length
  let copied = 0

  const remember = (localId: string, copy: Copy): void => {
    const others = (receipt[localId] ?? []).filter(
      (known) => known.remoteId !== copy.remoteId
    )
    receipt[localId] = [...others, copy]
    writeJSON(storage, RECEIPT_KEY, receipt)
  }

  const steps: Array<() => Promise<void>> = [
    ...plan.finish.map(({ session, remoteId }) => async (): Promise<void> => {
      await remote.update(remoteId, restoration(session))
      remember(session.id, { remoteId, complete: true })
    }),
    ...plan.create.map((session) => async (): Promise<void> => {
      const created = await remote.create({
        name: session.name,
        activities: session.activities,
        scenes: session.scenes,
        layoutMode: session.layoutMode,
      })
      // Written before the patch: a failure after this finishes this copy next
      // time instead of creating a second.
      remember(session.id, { remoteId: created.id, complete: false })
      if (!isCurrent()) throw new StaleAuthorityError("a transfer")
      await remote.update(created.id, restoration(session))
      remember(session.id, { remoteId: created.id, complete: true })
    }),
  ]

  for (const step of steps) {
    if (!isCurrent()) return { kind: "stale", copied }
    try {
      await step()
      copied += 1
    } catch (error) {
      if (error instanceof StaleAuthorityError) return { kind: "stale", copied }
      return { kind: "partial", copied, remaining: total - copied, error }
    }
  }
  return { kind: "copied", copied }
}

/**
 * How many of this device's sessions a press would send to the account in use,
 * or `null` when the account is not in use. Sends nothing but the reads
 * `planTransfer` needs.
 */
export async function previewDeviceTransfer(
  deps: TransferDeps = {}
): Promise<TransferPreview | null> {
  const token = authority.getAuthority()
  const remote = (deps.remote ?? defaultRemote)(token)
  if (token.kind !== "account" || remote === null) return null
  try {
    const plan = await planTransfer(
      remote,
      deps.storage ?? browserLocalStorage,
      () => authority.isCurrent(token)
    )
    return {
      toCopy: plan.create.length + plan.finish.length,
      alreadyThere: plan.alreadyThere,
    }
  } catch (error) {
    // Another account signed in while it asked: there is no answer for this one.
    if (error instanceof StaleAuthorityError) return null
    throw error
  }
}

/**
 * Copy the device's sessions into the account in use. Call it from one place:
 * the action behind the button that told the person what would be sent
 * (LA2).
 */
export async function copyDeviceSessions(
  deps: TransferDeps = {}
): Promise<TransferOutcome> {
  const token = authority.getAuthority()
  const remote = (deps.remote ?? defaultRemote)(token)
  if (token.kind !== "account" || remote === null) {
    return { kind: "not-on-account" }
  }
  const storage = deps.storage ?? browserLocalStorage
  const isCurrent = (): boolean => authority.isCurrent(token)
  try {
    const plan = await planTransfer(remote, storage, isCurrent)
    return await runTransfer(plan, remote, storage, isCurrent)
  } catch (error) {
    if (error instanceof StaleAuthorityError)
      return { kind: "stale", copied: 0 }
    throw error
  }
}

/** What the person is told, said by the screen in its own words. */
export type TransferNotices = {
  readonly copied: (count: number) => void
  readonly partial: (copied: number, remaining: number) => void
  readonly stale: () => void
}

/**
 * The action behind the confirmation button, and the only caller of
 * `copyDeviceSessions` (LA2): copy, then `refresh` what the screens read, then
 * say what happened. A failure to reach the account rejects, for the caller's
 * intent to show.
 */
export async function copyDeviceSessionsAndRefresh(
  refresh: () => Promise<unknown>,
  notices: TransferNotices
): Promise<void> {
  const outcome = await copyDeviceSessions()
  await refresh()
  switch (outcome.kind) {
    case "copied": {
      notices.copied(outcome.copied)
      return
    }
    case "partial": {
      notices.partial(outcome.copied, outcome.remaining)
      return
    }
    case "stale":
    case "not-on-account": {
      notices.stale()
      return
    }
    default: {
      return assertNever(outcome)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled transfer outcome: ${JSON.stringify(value)}`)
}
