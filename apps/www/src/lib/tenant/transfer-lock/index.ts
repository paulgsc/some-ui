/**
 * One transfer at a time across every tab of this browser.
 *
 * Two tabs that both press "Copy to my account" before either has written a
 * receipt would each plan a create and each send it: two copies of one device
 * session. So the whole of a transfer (plan, then run) happens under a lock
 * that only one tab holds, and a tab that cannot get it says so rather than
 * waiting or going ahead.
 *
 * - **Web Locks** (`navigator.locks`) where the browser has them: atomic across
 *   tabs, released by the browser if the holder's tab dies. Only secure
 *   contexts have them (https and localhost).
 * - **A storage lease** where it does not (the Docker image's plain `http://`
 *   listener): a timestamped token in `localStorage`, renewed while held and
 *   expiring if its holder dies. Writing then re-reading after a short wait
 *   shrinks the race to two presses landing in the same instant; it cannot
 *   close it, and `docs/learner-data-authority.md` (LA2) says so.
 */

import type { StorageAdapter } from "@/lib/tenant/storage"
import { browserLocalStorage } from "@/lib/tenant/storage"

const LOCK_NAME = "some-ui.tenant.sessions.transfer"
const LEASE_KEY = "some-ui.tenant.sessions.transfer.lease.v1"
/** A lease whose holder has not renewed it for this long is dead. */
const LEASE_TTL_MS = 30_000
const HEARTBEAT_MS = 10_000
/** How long to let a rival's write land before reading the lease back. */
const SETTLE_MS = 60

export type LockResult<T> =
  | { readonly held: true; readonly value: T }
  | { readonly held: false }

export type LockDeps = {
  /** `navigator.locks`, or `undefined` where there is none. */
  locks?: LockManager | undefined
  storage?: StorageAdapter
  now?: () => number
  wait?: (ms: number) => Promise<void>
}

type Lease = { token: string; at: number }

function readLease(storage: StorageAdapter): Lease | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(LEASE_KEY) ?? "null")
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "token" in parsed &&
      typeof parsed.token === "string" &&
      "at" in parsed &&
      typeof parsed.at === "number"
    ) {
      return { token: parsed.token, at: parsed.at }
    }
  } catch {
    // Unreadable: nobody holds it.
  }
  return null
}

function defaultLocks(): LockManager | undefined {
  // Typed as always present, and `undefined` outside secure contexts.
  const locks: LockManager | undefined =
    typeof navigator === "undefined" ? undefined : navigator.locks
  return locks
}

/**
 * Run `run` if no other tab is running a transfer, and say whether it ran.
 * Never waits: a second press is told it is busy.
 */
export async function withTransferLock<T>(
  run: () => Promise<T>,
  deps: LockDeps = {}
): Promise<LockResult<T>> {
  const locks = "locks" in deps ? deps.locks : defaultLocks()
  if (locks !== undefined) {
    return locks.request(
      LOCK_NAME,
      { ifAvailable: true },
      async (lock): Promise<LockResult<T>> =>
        lock === null ? { held: false } : { held: true, value: await run() }
    )
  }

  const storage = deps.storage ?? browserLocalStorage
  const now = deps.now ?? Date.now
  const wait =
    deps.wait ??
    ((ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms)))

  const live = readLease(storage)
  if (live !== null && now() - live.at < LEASE_TTL_MS) return { held: false }

  const token = `${String(now())}-${Math.random().toString(36).slice(2)}`
  const write = (): void => {
    storage.setItem(LEASE_KEY, JSON.stringify({ token, at: now() }))
  }
  write()
  await wait(SETTLE_MS)
  if (readLease(storage)?.token !== token) return { held: false }

  const heartbeat = setInterval(() => {
    if (readLease(storage)?.token === token) write()
  }, HEARTBEAT_MS)
  try {
    return { held: true, value: await run() }
  } finally {
    clearInterval(heartbeat)
    if (readLease(storage)?.token === token) storage.removeItem(LEASE_KEY)
  }
}
