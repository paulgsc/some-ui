import { useEffect } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import { isAccountRouteId } from "@/lib/auth/guards"
import { useAuthority } from "@/lib/authority"

/**
 * Sends the person to the passkey screen if they are on a page that is the
 * account's own and the account stops being their data authority there.
 *
 * `requireAccount` only runs on navigation. A session can also end between
 * navigations (it expired, another device signed out everywhere, the account
 * was deleted), and an account-only page has nothing to show without it.
 * Every other page keeps working on the device, so nothing else redirects:
 * losing a session ends account capability, not learning.
 */
export const AccountRouteGuard = (): null => {
  const { kind } = useAuthority()
  const onAccountRoute = useRouterState({
    select: (state) =>
      state.matches.some((match: { routeId: string }) =>
        isAccountRouteId(match.routeId)
      ),
  })
  const href = useRouterState({ select: (state) => state.location.href })
  const navigate = useNavigate()

  useEffect(() => {
    // `pending` is a returning account user's check in flight: wait for it.
    if (!onAccountRoute || kind === "account" || kind === "pending") return
    void navigate({ to: "/auth", search: { redirect: href } })
  }, [onAccountRoute, kind, href, navigate])

  return null
}
