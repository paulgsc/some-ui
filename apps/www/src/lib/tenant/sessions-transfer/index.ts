/**
 * Copy the sessions on this device into the account, when the person says so.
 *
 * Nothing moves unless a person pressed a button that named what would be
 * sent and where (`components/settings`): invariant LA2
 * (`docs/learner-data-authority.md`) says only `copyDeviceSessions` starts a
 * transfer, and only that button's action calls it. The copy itself, and what
 * it guarantees, is `lib/tenant/sessions-copy`'s.
 *
 * **One transfer at a time** under `withTransferLock` (Web Locks, or a renewed
 * storage lease on plain `http://`); a second tab is told it is busy.
 *
 * **Under one authority.** It checks the authority before each call; a change
 * ends it with progress recorded (`stale`).
 */

import type { Authority } from "@/lib/authority"
import { authority, StaleAuthorityError } from "@/lib/authority"
import { createFileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import type { TransferOutcome } from "@/lib/tenant/sessions-copy"
import { planTransfer, runTransfer } from "@/lib/tenant/sessions-copy"
import type { SessionsStore } from "@/lib/tenant/sessions-repository"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { browserLocalStorage } from "@/lib/tenant/storage"
import type { LockDeps } from "@/lib/tenant/transfer-lock"
import { withTransferLock } from "@/lib/tenant/transfer-lock"

/** What a person is asked about before anything is sent. */
export type TransferPreview = {
  /** Sessions a press would send. */
  readonly toCopy: number
  readonly alreadyThere: number
}

export type TransferDeps = {
  storage?: StorageAdapter
  /** How the cross-tab lock is taken. A test seam. */
  lock?: LockDeps
  /** The account's store for the authority a transfer began under. `null`: nothing to talk to. */
  remote?: (token: Authority) => SessionsStore | null
}

function defaultRemote(token: Authority): SessionsStore | null {
  if (token.kind !== "account") return null
  const transport = createFileHostTransport("account")
  return transport ? createHttpSessionsRepository(transport) : null
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
    // Plan and run under one lock: a second tab's plan, made before this one's
    // receipt was written, would send the same sessions again.
    const locked = await withTransferLock(
      async () => {
        const plan = await planTransfer(remote, storage, isCurrent)
        return runTransfer(plan, remote, storage, isCurrent)
      },
      { storage, ...deps.lock }
    )
    return locked.held ? locked.value : { kind: "busy" }
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
  /** Another tab is copying right now. */
  readonly busy: () => void
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
    case "busy": {
      notices.busy()
      return
    }
    default: {
      return assertNever(outcome)
    }
  }
}

// eslint-disable-next-line one-owner/no-local-primitive -- imports core-utils' once U2's branch lands (#2112)
function assertNever(value: never): never {
  throw new Error(`unhandled transfer outcome: ${JSON.stringify(value)}`)
}
