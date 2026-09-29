import { useEffect } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import { isPublicPath, useSessionStatus } from "@/lib/auth"

/**
 * Sends the person to the passkey screen the moment their session ends
 * while they are on a guarded page.
 *
 * The root guard only runs on navigation. A session can also end between
 * navigations: the server answers `401` to some request because the
 * session expired, or was ended from another device ("sign out
 * everywhere"), or the account was deleted. `lib/auth` learns of
 * that through the file_host transport, and this is what acts on it,
 * keeping the current address as the place to come back to.
 */
export const SignedOutRedirect = (): null => {
  const status = useSessionStatus()
  const location = useRouterState({ select: (state) => state.location })
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== "signed-out" || isPublicPath(location.pathname)) return
    void navigate({ to: "/auth", search: { redirect: location.href } })
  }, [status, location.pathname, location.href, navigate])

  return null
}
