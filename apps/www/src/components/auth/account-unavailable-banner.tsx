import type { JSX } from "react"
import { Link, useRouterState } from "@tanstack/react-router"

import { useAuthoritySnapshot } from "@/lib/authority"

/**
 * What a person sees when their account stops being usable (a session expired,
 * another device signed out everywhere) while they are in the middle of
 * something: a line, in place, and nothing else.
 *
 * They are not sent anywhere. The page stays up and keeps working on this
 * device, nothing is wiped or uploaded, and the account's data is simply not
 * shown until they sign in again (`lib/authority`: the authority falls back to
 * the device while the session is gone and returns to the account when one is
 * back). Pages that are the account's alone have nothing to show without it and
 * redirect (`account-route-guard`); every other page just says so here.
 */
export const AccountUnavailableBanner = (): JSX.Element | null => {
  const { accountUnavailable } = useAuthoritySnapshot()
  const href = useRouterState({ select: (state) => state.location.href })
  if (!accountUnavailable) return null

  return (
    <div
      role="status"
      className="bg-muted text-muted-foreground border-b px-4 py-2 text-sm"
    >
      Your account session ended, so its sessions are hidden and nothing is
      being sent to it. You can keep learning on this device.{" "}
      <Link
        to="/auth"
        search={{ redirect: href }}
        className="text-foreground underline underline-offset-2"
      >
        Sign in to see your account&apos;s data
      </Link>
      .
    </div>
  )
}
