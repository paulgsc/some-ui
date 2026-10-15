/**
 * The copy of a device's sessions into an account, shared by the browser's
 * transfer (`lib/tenant/sessions-transfer`, which adds its lock and its
 * authority, and is web-only) and the Android app's copy to its paired home
 * (`copySessionsTo`, from `lib/home-link/sessions`). Nothing calls it but
 * those two (LA2). A copy cannot be taken back (the server mints the ids and
 * nothing here deletes remotely).
 *
 * **Per account.** The device never learns an account's id, so the receipt
 * records the ids minted for each device session's copies, and asks the
 * account in use: `GET /sessions/:id` answers 404 for another account's
 * session. A second press for one account copies nothing; a press under
 * another account copies again.
 *
 * **Resumable.** There is no import endpoint: a copy is a create then a patch.
 * The receipt is written after each (`complete: false`, then `true`), so a
 * retry finishes an incomplete copy rather than creating another.
 *
 * **A create whose answer was lost.** The server has no idempotency key, so an
 * *unconfirmed attempt* is recorded before `POST /sessions` and cleared on any
 * answer. A retry that finds one adopts an unclaimed account session with the
 * same name, layout, activities and scenes before creating. It may adopt an
 * identical session the account already held: that costs a copy, never makes
 * a duplicate.
 *
 * Nothing is deleted locally.
 */

import { StaleAuthorityError } from "@/lib/authority"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import type { SessionsStore } from "@/lib/tenant/sessions-repository"
import { STORAGE_KEY } from "@/lib/tenant/sessions-repository"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { browserLocalStorage, readJSON, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

/** Versioned alongside the store it describes, so a change is a new key. */
const RECEIPT_KEY = "some-ui.tenant.sessions.transfers.v1"

type Copy = {
  /**
   * The id the server minted, or `null` for an attempt to create one whose
   * answer never arrived.
   */
  readonly remoteId: string | null
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
  /** Another tab is copying right now; nothing was planned or sent. */
  | { readonly kind: "busy" }

/** JSON with object keys in order, so two spellings of one value compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`)
      .join(",")}}`
  }
  return value === undefined ? "null" : JSON.stringify(value)
}

/** What `create` is given, which is what a copy made from it still carries. */
function sameContent(a: SessionRecord, b: SessionRecord): boolean {
  const content = (session: SessionRecord): string =>
    canonical([
      session.name,
      session.layoutMode,
      session.activities,
      session.scenes,
    ])
  return content(a) === content(b)
}

/**
 * What the account does and does not already hold of the device's sessions
 * (`local`: this browser's, unless the phone passes its own). Asks the
 * account about each session this device has copied before, and, only for
 * one whose create went unanswered, for its list of sessions.
 */
export async function planTransfer(
  remote: SessionsStore,
  storage: StorageAdapter,
  isCurrent: () => boolean = () => true,
  local: ReadonlyArray<SessionRecord> = readJSON<Array<SessionRecord>>(
    storage,
    STORAGE_KEY,
    []
  )
): Promise<TransferPlan> {
  const receipt = readReceipt(storage)
  const create: Array<SessionRecord> = []
  const finish: Array<{ session: SessionRecord; remoteId: string }> = []
  let alreadyThere = 0

  /** Every id any device session has been copied to, in any account. */
  const claimed = new Set(
    Object.values(receipt).flatMap((copies) =>
      copies.flatMap((copy) => (copy.remoteId === null ? [] : [copy.remoteId]))
    )
  )
  let inAccount: Array<SessionRecord> | null = null

  for (const session of local) {
    let unfinished: string | null = null
    let complete = false
    let unconfirmed = false
    for (const copy of receipt[session.id] ?? []) {
      if (!isCurrent()) throw new StaleAuthorityError("a transfer")
      if (copy.remoteId === null) {
        unconfirmed = true
        continue
      }
      if ((await remote.get(copy.remoteId)) === null) continue
      if (copy.complete) {
        complete = true
        break
      }
      unfinished ??= copy.remoteId
    }
    if (!complete && unfinished === null && unconfirmed) {
      // A create went out and nobody heard back: look for it before sending another.
      const held: Array<SessionRecord> = inAccount ?? (await remote.list())
      inAccount = held
      const found = held.find(
        (candidate) =>
          !claimed.has(candidate.id) && sameContent(session, candidate)
      )
      if (found !== undefined) {
        claimed.add(found.id)
        unfinished = found.id
      }
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
  const total = plan.create.length + plan.finish.length
  let copied = 0

  // Re-read for every write, never held: a stale snapshot written over another
  // tab's entries is how a duplicate would survive a failed lock.
  const write = (
    localId: string,
    next: (known: Array<Copy>) => Array<Copy>
  ): void => {
    const receipt = readReceipt(storage)
    receipt[localId] = next(receipt[localId] ?? [])
    writeJSON(storage, RECEIPT_KEY, receipt)
  }

  const remember = (localId: string, copy: Copy): void => {
    // A real copy supersedes any unconfirmed attempt, and replaces itself.
    write(localId, (known) => [
      ...known.filter(
        (other) => other.remoteId !== null && other.remoteId !== copy.remoteId
      ),
      copy,
    ])
  }

  /** Written before a create goes out, so a lost answer is not forgotten. */
  const attempting = (localId: string): void => {
    write(localId, (known) =>
      known.some((copy) => copy.remoteId === null)
        ? known
        : [...known, { remoteId: null, complete: false }]
    )
  }

  /** The server answered with an error status: nothing was created. */
  const answeredNo = (localId: string): void => {
    write(localId, (known) => known.filter((copy) => copy.remoteId !== null))
  }

  const steps: Array<() => Promise<void>> = [
    ...plan.finish.map(({ session, remoteId }) => async (): Promise<void> => {
      // Adopted from the account's list, or left unfinished by an earlier try:
      // it is this device session's copy from here on.
      remember(session.id, { remoteId, complete: false })
      await remote.update(remoteId, restoration(session))
      remember(session.id, { remoteId, complete: true })
    }),
    ...plan.create.map((session) => async (): Promise<void> => {
      attempting(session.id)
      let created: SessionRecord
      try {
        created = await remote.create({
          name: session.name,
          activities: session.activities,
          scenes: session.scenes,
          layoutMode: session.layoutMode,
        })
      } catch (error) {
        if (error instanceof FileHostResponseError) answeredNo(session.id)
        throw error
      }
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

/** A copy's end, and how many the account already held. */
export type CopyResult = {
  readonly outcome: Exclude<
    TransferOutcome,
    { kind: "not-on-account" } | { kind: "busy" } | { kind: "stale" }
  >
  readonly alreadyThere: number
}

/**
 * Copy the Android app's own sessions (`local`) into the account `remote`
 * answers for: its paired home. Call it from one place, the Home server
 * block's confirmed copy (`lib/home-link/sessions`, LA2 and LA8). The plan
 * and receipt are the browser's, so a second press sends nothing new. No
 * lock and no authority: the phone's link runs one thing at a time, and the
 * pairing is the account.
 */
export async function copySessionsTo(
  local: ReadonlyArray<SessionRecord>,
  remote: SessionsStore,
  storage: StorageAdapter = browserLocalStorage
): Promise<CopyResult> {
  const plan = await planTransfer(remote, storage, () => true, local)
  const outcome = await runTransfer(plan, remote, storage)
  if (outcome.kind === "stale" || outcome.kind === "busy") {
    throw new Error(`a phone copy cannot be ${outcome.kind}`)
  }
  return { outcome, alreadyThere: plan.alreadyThere }
}
