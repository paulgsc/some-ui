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

export type SessionStatus = "unknown" | "signed-in" | "signed-out"

type CeremonyStarted<TOptions> = { ceremony: string; options: TOptions }
type SessionView = { expiresAt: number }

let status: SessionStatus = "unknown"
let pending: Promise<boolean> | null = null
const listeners = new Set<() => void>()

function publish(next: SessionStatus): void {
  if (next === status) return
  status = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether the client currently believes it is signed in. Synchronous. */
export function hasSession(): boolean {
  return status === "signed-in"
}

export function getSessionStatus(): SessionStatus {
  return status
}

/** A ceremony (or a test) established a session. */
export function markSignedIn(): void {
  publish("signed-in")
}

/** The server said no session, or the person signed out. */
export function markSignedOut(): void {
  publish("signed-out")
}

onFileHostUnauthorized(markSignedOut)

/** Forget what is known, so the next `resolveSession` asks again. Tests. */
export function resetSessionForTests(): void {
  pending = null
  status = "unknown"
  for (const listener of listeners) listener()
}

function transportOrNull(): FileHostTransport | null {
  return DATA_MODE === "static" ? null : createFileHostTransport()
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof FileHostResponseError && error.status === 401
}

/**
 * Ask the server, once, whether this browser has a session; later calls
 * return what was learned. Resolves to whether there is one.
 *
 * An unreachable server reads as signed out: nothing a session would unlock
 * can be fetched anyway, and the passkey screen says what went wrong when
 * the person tries.
 */
export function resolveSession(): Promise<boolean> {
  if (status !== "unknown") return Promise.resolve(hasSession())
  if (pending) return pending

  const transport = transportOrNull()
  if (!transport) {
    publish("signed-out")
    return Promise.resolve(false)
  }

  pending = requestJSON<SessionView>(transport, "/auth/session")
    .then(() => {
      publish("signed-in")
      return true
    })
    .catch(() => {
      publish("signed-out")
      return false
    })
    .finally(() => {
      pending = null
    })
  return pending
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
  markSignedOut()
}

/** End this browser's session. */
export const signOut = (): Promise<void> => leave("/auth/sign-out")

/** End every session this account holds, on every device. */
export const signOutEverywhere = (): Promise<void> =>
  leave("/auth/sign-out-everywhere")

/** Delete the account and everything the server stores for it. */
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
 * session", which is a statement about whether client-side work has anything
 * to do yet. Whether a request is *allowed* is the server's question.
 */
export function useHasSession(): boolean {
  return useSyncExternalStore(subscribe, hasSession, hasSession)
}

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(subscribe, getSessionStatus, getSessionStatus)
}
