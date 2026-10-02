/**
 * Which `SessionsStore` a call goes to, decided *per call* by the learner's
 * data authority (`lib/authority`).
 *
 * - **Local** — the device. `localStorage` (`sessions-repository`). Nothing
 *   leaves the browser, and no account or session is needed. This is the
 *   default wherever a `file_host` is optional, and the only store on the
 *   GitHub Pages build.
 * - **Account** — `file_host`, through the credentialed account transport.
 *   Chosen by the person (signing in, or switching), never by default.
 *
 * The choice is read when a call *starts* and kept with it. If the authority
 * is a different one by the time the call finishes (a sign-out, a switch,
 * another account signing in), the result is dropped with a
 * `StaleAuthorityError` rather than handed to a view that now reads another
 * store. A write that already reached the old store stays there: it was made
 * for the old authority, and nothing here moves it.
 *
 * ## No fallback between the two
 *
 * A `file_host` that is down makes account sessions fail, visibly, rather than
 * quietly writing to the device. That is deliberate: a silent fallback lands
 * writes in whichever store happened to be reachable, and leaves two histories
 * with no way to tell which is which. The only switch is the person's own, or
 * a lost session, and a lost session is a *named* state (`accountUnavailable`)
 * the UI says out loud, not a hidden retry.
 *
 * ## Nothing is uploaded for the person
 *
 * Signing in does not copy this browser's sessions to the account. That used to
 * happen on the first call after a sign-in, with no prompt, to whichever
 * account signed in first. Moving them is an explicit, per-account act
 * (`sessions-transfer`, behind a button on the settings screen), invariant LA2 in
 * `lib/authority`.
 */

import { resolveSessionIfChosen } from "@/lib/auth/session"
import type { Authority } from "@/lib/authority"
import { authority, StaleAuthorityError } from "@/lib/authority"
import { createFileHostTransport } from "@/lib/file-host-config/client"

import { createHttpSessionsRepository } from "./http-sessions-repository"
import type {
  CreateSessionInput,
  SessionsStore,
  UpdateSessionInput,
} from "./sessions-repository"
import { createSessionsRepository } from "./sessions-repository"
import type { StorageAdapter } from "./storage"
import { browserLocalStorage } from "./storage"
import type { SessionRecord, SessionStatus } from "./types"

/** What `createSessionsBackend` reads from the world; every part is a test seam. */
export type SessionsBackendDeps = {
  storage?: StorageAdapter
  /** Settles a returning account user's undecided authority. */
  settle?: () => Promise<unknown>
  /** The account store for the authority a call began under. `null`: nothing to talk to. */
  remote?: (token: Authority) => SessionsStore | null
}

function defaultRemote(): (token: Authority) => SessionsStore | null {
  // One account repository per authority incarnation: its transport refuses to
  // send once the authority has moved on, so it must not outlive it.
  let held: { epoch: number; store: SessionsStore | null } | null = null
  return (token) => {
    if (held?.epoch !== token.epoch) {
      const transport = createFileHostTransport("account")
      held = {
        epoch: token.epoch,
        store: transport ? createHttpSessionsRepository(transport) : null,
      }
    }
    return held.store
  }
}

export function createSessionsBackend(
  deps: SessionsBackendDeps = {}
): SessionsStore {
  const local = createSessionsRepository(deps.storage ?? browserLocalStorage)
  const settle = deps.settle ?? resolveSessionIfChosen
  const remote = deps.remote ?? defaultRemote()

  /** The authority this call runs under, once a returning account user's is decided. */
  async function begin(): Promise<Authority> {
    if (authority.getAuthority().kind === "pending") await settle()
    return authority.getAuthority()
  }

  async function through<T>(
    run: (store: SessionsStore) => Promise<T>
  ): Promise<T> {
    const token = await begin()
    // No `window`, so no base URL (SSR, a unit test): the device is the honest
    // answer, as it is for `local`.
    const store = token.kind === "account" ? (remote(token) ?? local) : local
    const result = await run(store)
    if (!authority.isCurrent(token)) {
      throw new StaleAuthorityError("a sessions call")
    }
    return result
  }

  return {
    list: (): Promise<Array<SessionRecord>> => through((s) => s.list()),
    get: (id: string): Promise<SessionRecord | null> =>
      through((s) => s.get(id)),
    create: (input: CreateSessionInput): Promise<SessionRecord> =>
      through((s) => s.create(input)),
    update: (id: string, patch: UpdateSessionInput): Promise<SessionRecord> =>
      through((s) => s.update(id, patch)),
    remove: (id: string): Promise<void> => through((s) => s.remove(id)),
    removeMany: (ids: ReadonlyArray<string>): Promise<void> =>
      through((s) => s.removeMany(ids)),
    updateStatusMany: (
      ids: ReadonlyArray<string>,
      status: SessionStatus
    ): Promise<Array<SessionRecord>> =>
      through((s) => s.updateStatusMany(ids, status)),
    duplicate: (id: string): Promise<SessionRecord> =>
      through((s) => s.duplicate(id)),
  }
}
