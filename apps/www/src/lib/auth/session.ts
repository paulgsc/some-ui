/**
 * Whether this browser is signed in, and the passkey ceremonies that change
 * it.
 *
 * A passkey is the only way in (`paulgsc/server` `docs/identity.md`,
 * "Passkey auth"). The session itself is an `HttpOnly` cookie `file_host`
 * sets and this code can never read: what lives here is only the client's
 * *belief* about it, learned from `GET /auth/session` and from the answers
 * to the ceremonies below. The server is the authority. A `401` from any
 * route ends the belief (`markSignedOut`), and the app sends the person back
 * to the passkey screen.
 *
 * Nothing here holds or sends a name, an email, or a device detail.
 *
 * On the GitHub Pages build there is no server and so no account: the
 * passkey screen is a preview, and "signing in" only opens the demo
 * (`DATA_MODE === "static"`).
 */
import { useSyncExternalStore } from "react"

import type { SessionBelief } from "@/lib/authority"
import { authority } from "@/lib/authority"
import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostResponseError,
  onFileHostUnauthorized,
  requestJSON,
} from "@/lib/file-host-config/client"
import type { CreationOptionsJSON, RequestOptionsJSON } from "@/lib/passkey"
import { createPasskey, signWithPasskey } from "@/lib/passkey"

export type SessionStatus = SessionBelief

type CeremonyStarted<TOptions> = { ceremony: string; options: TOptions }
type SessionView = { expiresAt: number }

let pending: Promise<boolean> | null = null
/**
 * Bumped by every ceremony or sign-out, so a `/auth/session` probe that was
 * already in flight cannot overwrite what they learned: a slow cookieless
 * probe answering 401 after a sign-in must not sign the person back out.
 */
let generation = 0

/**
 * Whether the client currently believes it holds a server session.
 * Synchronous. The belief itself lives in `lib/authority`, next to the
 * person's choice of where their data lives: a session says what the account
 * *could* do, the authority says what it is doing.
 */
export function hasSession(): boolean {
  return authority.getSnapshot().session === "signed-in"
}

export function getSessionStatus(): SessionStatus {
  return authority.getSnapshot().session
}

/**
 * Call `listener` whenever the authority this tab acts for may have changed:
 * a session ended, a ceremony started one (possibly for another account), or
 * the person moved their data between the device and the account. The app
 * clears its query cache on it (`providers/tanstack-query`), so nothing one
 * authority fetched is shown under the next. Not called when a page load
 * learns of an existing session, which changes no account.
 */
export function onAccountChange(listener: () => void): () => void {
  return authority.onAuthorityChange(listener)
}

/** A ceremony (or a test) established a session, and the account is now the person's data. */
export function markSignedIn(): void {
  generation += 1
  authority.dispatch({ type: "session-started", adopt: true })
}

/**
 * The session ended. `forget` is the person leaving on purpose; a server `401`
 * (an expiry, another device's "sign out everywhere") is not that, and leaves
 * their choice of the account standing for when a session is back.
 */
export function markSignedOut(options: { forget?: boolean } = {}): void {
  generation += 1
  authority.dispatch({ type: "session-ended", forget: options.forget ?? false })
}

// A 401 ends the session only if nothing has changed it since that request
// was sent (see `generation`).
onFileHostUnauthorized(() => {
  const sent = generation
  return (): void => {
    if (generation === sent) markSignedOut()
  }
})

/** Forget what is known, so the next `resolveSession` asks again. Tests. */
export function resetSessionForTests(): void {
  pending = null
  generation += 1
  authority.resetForTests()
}

function transportOrNull(): FileHostTransport | null {
  return DATA_MODE === "static" ? null : createFileHostTransport("ceremony")
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof FileHostResponseError && error.status === 401
}

/**
 * Ask the server, once, whether this browser has a session; later calls
 * return what was learned. Resolves to whether there is one.
 *
 * Only a caller that has reason to (the person chose their account, or is
 * on the passkey screen) asks. A visitor learning on the device never causes
 * this request: `lib/authority`'s `ensureSessionIfChosen` is the boot-time
 * caller, and it asks only when the account was chosen.
 *
 * An unreachable server is not read as a lost session: the person's choice of
 * the account stands, its calls fail where they can be seen, and the next
 * caller asks again. Only a 401 ends the belief.
 */
export function resolveSession(): Promise<boolean> {
  // Only an answer is final: an unreachable server is asked again.
  const known = getSessionStatus()
  if (known === "signed-in" || known === "signed-out") {
    return Promise.resolve(hasSession())
  }
  if (pending) return pending

  const transport = transportOrNull()
  if (!transport) {
    authority.dispatch({ type: "session-learned", session: "signed-out" })
    return Promise.resolve(false)
  }

  const asked = generation
  // A ceremony or sign-out since this probe was sent knows better than it.
  const settle = (
    answer: "signed-in" | "signed-out" | "unreachable"
  ): boolean => {
    if (generation === asked) {
      authority.dispatch({ type: "session-learned", session: answer })
    }
    return hasSession()
  }
  pending = requestJSON<SessionView>(transport, "/auth/session")
    .then(() => settle("signed-in"))
    // Only a 401 says there is no session. Anything else (a timeout, a 5xx, a
    // refused connection, a CORS failure) says nothing about it.
    .catch((error: unknown) =>
      settle(isUnauthorized(error) ? "signed-out" : "unreachable")
    )
    .finally(() => {
      pending = null
    })
  return pending
}

/**
 * `resolveSession`, but only for someone who chose their account.
 *
 * This is what boot and a returning account user's first call use. A visitor
 * learning on the device has no reason to ask a server whether they hold a
 * session, so for them it asks nothing and sends nothing: the first request a
 * cookie rides on is one they started themselves, on the passkey screen.
 */
export function resolveSessionIfChosen(): Promise<boolean> {
  if (authority.getSnapshot().choice !== "account") {
    return Promise.resolve(hasSession())
  }
  return resolveSession()
}

const POST: RequestInit = { method: "POST" }

/** The second half of every ceremony: the browser's answer, and its handle. */
async function finish(
  transport: FileHostTransport,
  path: string,
  ceremony: string,
  credential: unknown,
  extra: Record<string, string> = {}
): Promise<void> {
  await requestJSON(transport, path, {
    method: "POST",
    body: JSON.stringify({ ceremony, credential, ...extra }),
  })
}

/**
 * Create a new account with a new passkey, and sign in to it.
 *
 * `legacyClaim` is the operator's one-time `AUTH_LEGACY_CLAIM_TOKEN`
 * (`readLegacyClaim`). With it, the new account inherits what the server
 * kept before accounts existed. The server refuses a wrong token (403) or a
 * second claim (409). Without it, the account starts empty.
 */
export async function createAccount(legacyClaim?: string): Promise<void> {
  const transport = transportOrNull()
  if (transport) {
    const started = await requestJSON<CeremonyStarted<CreationOptionsJSON>>(
      transport,
      "/auth/register/start",
      POST
    )
    const credential = await createPasskey(started.options)
    await finish(
      transport,
      "/auth/register/finish",
      started.ceremony,
      credential,
      legacyClaim === undefined ? {} : { legacyClaim }
    )
  }
  markSignedIn()
}

/**
 * The claim token in an `/auth#claim=<token>` link, if this page has one.
 * It rides in the fragment because a browser never sends a fragment to any
 * server, so no access log or proxy sees the token.
 */
export function readLegacyClaim(hash: string): string | undefined {
  const claim = new URLSearchParams(hash.replace(/^#/, "")).get("claim")
  return claim === null || claim === "" ? undefined : claim
}

/** Sign in with any passkey this browser holds for the site. */
export async function signIn(): Promise<void> {
  const transport = transportOrNull()
  if (transport) {
    const started = await requestJSON<CeremonyStarted<RequestOptionsJSON>>(
      transport,
      "/auth/sign-in/start",
      POST
    )
    const credential = await signWithPasskey(started.options)
    await finish(
      transport,
      "/auth/sign-in/finish",
      started.ceremony,
      credential
    )
  }
  markSignedIn()
}

/**
 * Add a passkey on this device to the signed-in account. A `401` here has
 * already ended the session through the transport's unauthorized handler.
 */
export async function addPasskey(): Promise<void> {
  const transport = transportOrNull()
  if (!transport) return
  const started = await requestJSON<CeremonyStarted<CreationOptionsJSON>>(
    transport,
    "/auth/passkeys/start",
    POST
  )
  const credential = await createPasskey(started.options)
  await finish(transport, "/auth/passkeys/finish", started.ceremony, credential)
}

async function leave(path: string, init: RequestInit = POST): Promise<void> {
  const transport = transportOrNull()
  if (transport) {
    await requestJSON(transport, path, init).catch((error: unknown) => {
      // Already signed out is the outcome being asked for.
      if (!isUnauthorized(error)) throw error
    })
  }
  markSignedOut({ forget: true })
}

/** End this browser's session. */
export const signOut = (): Promise<void> => leave("/auth/sign-out")

/** End every session this account holds, on every device. */
export const signOutEverywhere = (): Promise<void> =>
  leave("/auth/sign-out-everywhere")

/**
 * Delete the account and everything stored under its ID in the server's
 * database. Server logs and backups are not rewritten.
 */
export const deleteAccount = (): Promise<void> =>
  leave("/auth/account", { method: "DELETE" })

/**
 * Reactive `hasSession`. `beforeLoad` guards re-run on every navigation, so
 * the plain getter is enough there - but a component that skips a fetch, or
 * an expensive mount (a speech session's audio context, a service worker
 * registration), based on this needs to find out the moment a session
 * appears or ends, not just the next time the router re-evaluates a route.
 *
 * Read the name literally: this answers "does the client believe there is a
 * session", which is a statement about whether *account* work has anything to
 * do. It does not say where the person's data lives (`useAuthority`), and
 * learning on the device needs no session at all.
 */
export function useHasSession(): boolean {
  return useSyncExternalStore(authority.subscribe, hasSession, hasSession)
}

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(
    authority.subscribe,
    getSessionStatus,
    getSessionStatus
  )
}
