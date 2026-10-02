import { redirect } from "@tanstack/react-router"

import { authority } from "@/lib/authority"

import { resolveSessionIfChosen } from "./session"

/**
 * The route-id prefix of the pages that are the account's business and nothing
 * else: the LAN operator tools. Everything else works on the device with no
 * session, so nothing else asks for one.
 */
const ACCOUNT_ROUTE_PREFIX = "/_dashboard/_lan"

export function isAccountRouteId(routeId: string): boolean {
  return (
    routeId === ACCOUNT_ROUTE_PREFIX ||
    routeId.startsWith(`${ACCOUNT_ROUTE_PREFIX}/`)
  )
}

/**
 * `beforeLoad` for a page that only makes sense for an account. Asks the
 * server about a session only if the person chose their account, then sends
 * anyone who is not on it to the passkey screen, with this address to come
 * back to.
 */
export async function requireAccount(href: string): Promise<void> {
  await resolveSessionIfChosen()
  if (!authority.is("account")) {
    throw redirect({ to: "/auth", search: { redirect: href } })
  }
}
