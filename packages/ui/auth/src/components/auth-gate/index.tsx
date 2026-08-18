import type { FC, ReactNode } from "react"
import type { AuthStatus } from "@auth/types/auth"
import { assertNever } from "@auth/utils/error"
import { Skeleton } from "@some-ui/shared"

export type AuthGateProps = {
  status: AuthStatus
  /** Rendered only when `status` is `"authenticated"`. */
  children: ReactNode
  /** Rendered when `status` is `"unauthenticated"` — usually the sign-in flow. */
  fallback: ReactNode
  /** Rendered while `status` is `"unknown"`. Defaults to a skeleton block. */
  pending?: ReactNode
}

const DefaultPending = (): ReactNode => (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    <span className="sr-only">Checking your session</span>
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-32 w-full" />
  </div>
)

/**
 * Renders gated content only once the session is known to exist.
 *
 * This is a *rendering* gate, not a security boundary. Anything reachable
 * behind it is still in the bundle the browser downloaded, and a determined
 * viewer can flip `status` in the console. The authority is the server: every
 * request the gated content makes must be independently authorized, and the
 * gate's only job is to keep the signed-out user from staring at an interface
 * that will 401 on contact.
 *
 * The three-way `status` is why `"unknown"` exists as its own case rather than
 * folding into `"unauthenticated"`. Collapsing them renders the sign-in screen
 * for one frame on every reload of an authenticated session, which is the
 * flicker this component is mainly here to prevent.
 */
export const AuthGate: FC<AuthGateProps> = ({
  status,
  children,
  fallback,
  pending,
}) => {
  switch (status) {
    case "authenticated": {
      return <>{children}</>
    }
    case "unauthenticated": {
      return <>{fallback}</>
    }
    case "unknown": {
      return <>{pending ?? <DefaultPending />}</>
    }
    default: {
      return assertNever(status)
    }
  }
}
