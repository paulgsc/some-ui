/**
 * The shell's page body (`routes/_dashboard.tsx`): what holds the route, and
 * on the phone, what a drag down from the top checks again in.
 */
import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"

import { MOBILE_APP } from "@/lib/build-profile"
import { PullToCheck } from "@/components/pull-to-check"

/**
 * Whether a drag down checks again here: on the phone's page routes only.
 * The desktop web has the browser's reload (D4), and a bounded route keeps
 * its drags for itself, so a stray pull never interrupts a take or a round
 * (D2, epic #2456).
 */
const pullsHere = (bounded: boolean): boolean => MOBILE_APP && !bounded

export const PageBody = ({
  bounded,
  bare,
  children,
}: {
  /** A surface the shell hands a definite height (`isBoundedRoute`). */
  bounded: boolean
  /** The live player at phone width, where the screen is the session's. */
  bare: boolean
  children: ReactNode
}): JSX.Element => (
  <div
    className={cn(
      "flex-1",
      // 24px on every side is a desktop budget the bounded routes on a
      // phone cannot afford.
      bare ? "p-0" : "p-4 sm:p-6",
      // scroll-intent: page — an ordinary document route scrolls as a
      // page; bounded routes take the overflow-hidden branch (docs/ui-fit,
      // docs/session-viewport/02-kill-the-cutoff.md).
      bounded ? "min-h-0 overflow-hidden" : "overflow-auto"
    )}
  >
    {/* Behind the device build's flag, which the build folds away, so the
        lan and Pages builds ship none of it (check:bundle-paths). Before the
        route, and `false` in its place otherwise, so turning bounded never
        remounts the route. */}
    {import.meta.env.VITE_DEVICE_BACKEND === "true" && pullsHere(bounded) && (
      <PullToCheck />
    )}
    {children}
  </div>
)
