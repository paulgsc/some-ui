/**
 * The copy of a device's sessions into an account, shared by the browser's
 * transfer (`lib/tenant/sessions-transfer`, which adds its lock and its
 * authority, and is web-only) and the Android app's copy to its paired home
 * (`copySessionsTo`, from `lib/home-link/sessions`). Nothing calls it but
 * those two (LA2). A copy cannot be taken back (nothing here deletes
 * remotely).
 *
 * **Per account.** The device never learns an account's id, so the receipt
 * records the ids minted for each device session's copies, and asks the
 * account in use: `GET /sessions/:id` answers 404 for another account's
 * session. A second press for one account copies nothing new; a press under
 * another account copies again.
 *
 * **Kept current.** A copy is made once, but a session can move on after it
 * (planned when copied, finished later; renamed). A press that finds the
 * account's copy no longer matching the device patches it to match, so the
 * account never keeps a stale one and the phone can let its own go.
 *
 * **Resumable.** There is no import endpoint: a copy is a create then a patch.
 * The receipt is written after each (`complete: false`, then `true`), so a
 * retry finishes an incomplete copy rather than creating another.
 *
 * **A create whose answer was lost.** An *unconfirmed attempt* is recorded
 * before `POST /sessions` and cleared on any answer. The phone's copy names
 * the id it creates under in that attempt (`named`), which home since
 * paulgsc/server#432 creates once however often it is sent: a retry asks
 * home for that id, adopts it if there, and otherwise sends the same create
 * again. A home that predates it mints its own id, so a retry that does not
 * find the named one, and the browser's transfer, which names none, still
 * adopt an unclaimed account session with the same name, layout, activities
 * and scenes before creating. That may adopt an identical session the
 * account already held: it costs a copy, never makes a duplicate.
 *
 * Nothing here deletes, locally or remotely.
 */

import type { KeyedStorage } from "@some-ui/core-utils"
import {
  canonicalJson,
  openKept,
  salvageEntries,
  writeKept,
} from "@some-ui/core-utils"

import { StaleAuthorityError } from "@/lib/authority"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import type { SessionsStore } from "@/lib/tenant/sessions-repository"
import { keptSessions } from "@/lib/tenant/sessions-repository"
import {
  browserLocalStorage,
  generateId,
  NotKeptError,
} from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

/** Versioned alongside the store it describes, so a change is a new key. */
const RECEIPT_KEY = "some-ui.tenant.sessions.transfers.v1"

type Copy = {
  /**
   * The id the server answered with, or `null` for an attempt to create one
   * whose answer never arrived.
   */
  readonly remoteId: string | null
  /** For an attempt, the id its create named, if it named one. */
  readonly named?: string
  /** The second step (restoring status and times) landed too. */
  readonly complete: boolean
}

/** Device session id -> every copy ever made of it, in any account. */
type Receipt = Record<string, Array<Copy>>

/**
 * A copy as kept. `remoteId` may be absent: a create answered without an id
 * was kept that way, and is read as it always was.
 */
function isCopy(value: unknown): value is Copy {
  if (typeof value !== "object" || value === null) return false
  const remoteId: unknown = Reflect.get(value, "remoteId")
  const named: unknown = Reflect.get(value, "named")
  return (
    (remoteId === undefined ||
      remoteId === null ||
      typeof remoteId === "string") &&
    (named === undefined || typeof named === "string") &&
    typeof Reflect.get(value, "complete") === "boolean"
  )
}

const readCopies = salvageEntries((value): Array<Copy> | null =>
  Array.isArray(value) && value.every(isCopy) ? value : null
)

/**
 * The receipt, read afresh each time (callers write into it); a receipt it
 * cannot read whole is copied aside first.
 */
function readReceipt(storage: KeyedStorage): Receipt {
  return { ...openKept(storage, RECEIPT_KEY, readCopies, {}).value }
}

export type TransferPlan = {
  /** On the device and nowhere in this account yet. */
  readonly create: ReadonlyArray<SessionRecord>
  /**
   * Started in this account by an earlier try and never finished, or
   * finished and changed on the device since: one patch each.
   */
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

/** What `create` is given, which is what a copy made from it still carries. */
function sameContent(a: SessionRecord, b: SessionRecord): boolean {
  const content = (session: SessionRecord): string =>
    canonicalJson([
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
  storage: KeyedStorage,
  isCurrent: () => boolean = () => true,
  local: ReadonlyArray<SessionRecord> = keptSessions(storage)
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
  /** Ids attempts named: each is its own session's to find, never matched. */
  const named = new Set(
    Object.values(receipt).flatMap((copies) =>
      copies.flatMap((copy) => (copy.named === undefined ? [] : [copy.named]))
    )
  )
  let inAccount: Array<SessionRecord> | null = null

  for (const session of local) {
    let unfinished: string | null = null
    let complete = false
    let unconfirmed = false
    let own: string | undefined
    for (const copy of receipt[session.id] ?? []) {
      if (!isCurrent()) throw new StaleAuthorityError("a transfer")
      if (copy.remoteId === null) {
        unconfirmed = true
        own ??= copy.named
        continue
      }
      const there = await remote.get(copy.remoteId)
      if (there === null) continue
      if (copy.complete) {
        if (sameRecord(session, there)) complete = true
        else unfinished = copy.remoteId
        break
      }
      unfinished ??= copy.remoteId
    }
    if (!complete && unfinished === null && own !== undefined) {
      // A create named its id and nobody heard back: home holds it, or not.
      if (!claimed.has(own) && (await remote.get(own)) !== null) {
        claimed.add(own)
        unfinished = own
      }
    }
    if (!complete && unfinished === null && unconfirmed) {
      // A create went out and nobody heard back: look for it before sending another.
      const held: Array<SessionRecord> = inAccount ?? (await remote.list())
      inAccount = held
      const found = held.find(
        (candidate) =>
          !claimed.has(candidate.id) &&
          !named.has(candidate.id) &&
          sameContent(session, candidate)
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

/** Everything a copy carries, for a copy that may not hold it yet. */
function caughtUp(
  session: SessionRecord
): Parameters<SessionsStore["update"]>[1] {
  return {
    name: session.name,
    activities: session.activities,
    scenes: session.scenes,
    layoutMode: session.layoutMode,
    ...restoration(session),
  }
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
 * is the whole duplicate guard: a run that stops anywhere resumes there. With
 * `mint`, each create names its id, kept in its attempt until answered.
 */
export async function runTransfer(
  plan: TransferPlan,
  remote: SessionsStore,
  storage: KeyedStorage,
  isCurrent: () => boolean = () => true,
  mint?: () => string
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
    if (!writeKept(storage, RECEIPT_KEY, receipt, readCopies)) {
      throw new NotKeptError()
    }
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

  /**
   * Written before a create goes out, so a lost answer is not forgotten; the
   * id it names, the same on every retry until home answers.
   */
  const attempting = (localId: string): string | undefined => {
    let named: string | undefined
    write(localId, (known) => {
      const pending = known.find((copy) => copy.remoteId === null)
      named = pending?.named ?? mint?.()
      return [
        ...known.filter((copy) => copy !== pending),
        {
          remoteId: null,
          complete: false,
          ...(named === undefined ? {} : { named }),
        },
      ]
    })
    return named
  }

  /** The server answered with an error status: nothing was created. */
  const answeredNo = (localId: string): void => {
    write(localId, (known) => known.filter((copy) => copy.remoteId !== null))
  }

  const steps: Array<() => Promise<void>> = [
    ...plan.finish.map(({ session, remoteId }) => async (): Promise<void> => {
      // Adopted from the account's list, left unfinished by an earlier try,
      // or changed on the device since: it is this device session's copy
      // from here on, and now holds what the device does.
      remember(session.id, { remoteId, complete: false })
      await remote.update(remoteId, caughtUp(session))
      remember(session.id, { remoteId, complete: true })
    }),
    ...plan.create.map((session) => async (): Promise<void> => {
      const named = attempting(session.id)
      let created: SessionRecord
      try {
        created = await remote.create({
          ...(named === undefined ? {} : { id: named }),
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
 * pairing is the account. Each create names its id.
 */
export async function copySessionsTo(
  local: ReadonlyArray<SessionRecord>,
  remote: SessionsStore,
  storage: KeyedStorage = browserLocalStorage
): Promise<CopyResult> {
  const plan = await planTransfer(remote, storage, () => true, local)
  const outcome = await runTransfer(
    plan,
    remote,
    storage,
    () => true,
    () => generateId("session")
  )
  if (outcome.kind === "stale" || outcome.kind === "busy") {
    throw new Error(`a phone copy cannot be ${outcome.kind}`)
  }
  return { outcome, alreadyThere: plan.alreadyThere }
}

/**
 * What `confirmHeld` found, filled as it goes so a stop keeps what it had
 * already confirmed.
 */
export type HeldReport = {
  /** Device sessions the account holds exactly as the device does. */
  held: Array<string>
  /** Copied, but the account's copy no longer matches the device's. */
  differs: Array<string>
  /** No complete copy the account still holds. */
  notThere: Array<string>
}

export function emptyHeldReport(): HeldReport {
  return { held: [], differs: [], notThere: [] }
}

/** The same instant, however each side spells it; or both absent. */
function sameStamp(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return a == null && b == null
  return Date.parse(a) === Date.parse(b)
}

/** Everything a copy carries: its content and what `restoration` restores. */
function sameRecord(device: SessionRecord, account: SessionRecord): boolean {
  return (
    sameContent(device, account) &&
    device.status === account.status &&
    device.totalDurationMs === account.totalDurationMs &&
    (device.finalElapsedMs ?? null) === (account.finalElapsedMs ?? null) &&
    canonicalJson(device.layout) === canonicalJson(account.layout) &&
    sameStamp(device.startedAt, account.startedAt) &&
    sameStamp(device.completedAt, account.completedAt)
  )
}

/**
 * Which of `local` the account `remote` holds as the device does now: a
 * complete copy in the receipt, read back (`GET /sessions/:id`) and
 * matching. Reads only. Throws what a read throws, with `report` holding
 * what was confirmed before it.
 */
export async function confirmHeld(
  local: ReadonlyArray<SessionRecord>,
  remote: SessionsStore,
  report: HeldReport,
  storage: KeyedStorage = browserLocalStorage
): Promise<void> {
  const receipt = readReceipt(storage)
  for (const session of local) {
    const copies = (receipt[session.id] ?? []).filter(
      (copy): copy is Copy & { remoteId: string } =>
        copy.complete && copy.remoteId !== null
    )
    let verdict: "held" | "differs" | "notThere" = "notThere"
    for (const copy of copies) {
      const there = await remote.get(copy.remoteId)
      if (there === null) continue
      if (sameRecord(session, there)) {
        verdict = "held"
        break
      }
      verdict = "differs"
    }
    report[verdict].push(session.id)
  }
}
