import type { JSX } from "react"
import { Skeleton } from "@some-ui/shared"

/**
 * Generic route-loading fallback. Wired as the router's
 * `defaultPendingComponent`; a neutral skeleton shown while a route resolves
 * so navigation never flashes a blank frame.
 */
export const RoutePending = (): JSX.Element => (
  <div
    className="text-foreground w-full space-y-4 p-6"
    role="status"
    aria-busy="true"
    aria-label="Loading"
  >
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-40 w-full" />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
    <span className="sr-only">Loading…</span>
  </div>
)
