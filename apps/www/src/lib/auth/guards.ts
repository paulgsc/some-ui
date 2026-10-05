/**
 * The route-id prefix of the pages that are the account's business and nothing
 * else: the LAN operator tools. Everything else works on the device with no
 * session, so nothing else asks for one.
 *
 * Pure on purpose (no router, no React): the check that sends someone to the
 * passkey screen is in the route itself (`routes/_dashboard/_lan.tsx`), and
 * the wait for a returning account user's session is the authority runtime's
 * (`authority.settled()`), so neither lives in a module R1 would count.
 */
const ACCOUNT_ROUTE_PREFIX = "/_dashboard/_lan"

export function isAccountRouteId(routeId: string): boolean {
  return (
    routeId === ACCOUNT_ROUTE_PREFIX ||
    routeId.startsWith(`${ACCOUNT_ROUTE_PREFIX}/`)
  )
}
