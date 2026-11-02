/**
 * Drag down from the top of a phone page to check again (PULL0, #2457). The
 * shell's page body (`./page-body`) mounts `PullToCheck` as its first child
 * on the Android app's page routes, never a bounded one (D2): it listens on
 * the element it sits in, the page scroller, through `lib/pull-refresh`'s
 * runtime, and shows the state that runtime keeps. It decides nothing.
 */
import type { JSX } from "react"
import { useCallback, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { onlineManager, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { ArrowDown, Check, CircleAlert, RefreshCw } from "lucide-react"

import type { Phase } from "@/lib/pull-refresh"
import {
  ARM_PX,
  createPullRuntime,
  pullWords,
  readsOnScreen,
} from "@/lib/pull-refresh"

const PhaseIcon = ({ phase }: { phase: Phase }): JSX.Element | null => {
  const icon = "size-4 shrink-0"
  switch (phase.kind) {
    case "pulling":
    case "armed": {
      return (
        <ArrowDown
          aria-hidden
          className={cn(
            icon,
            "transition-transform",
            phase.kind === "armed" && "rotate-180"
          )}
        />
      )
    }
    case "checking": {
      return (
        <RefreshCw
          aria-hidden
          className={cn(icon, "motion-safe:animate-spin")}
        />
      )
    }
    case "done": {
      return <Check aria-hidden className={icon} />
    }
    case "failed": {
      return (
        <CircleAlert aria-hidden className={cn(icon, "text-destructive")} />
      )
    }
    case "idle":
    case "tracking": {
      return null
    }
    default: {
      return assertNever(phase)
    }
  }
}

/**
 * The indicator for `phase`: a pill that comes down from under the header
 * with the finger and rests at the top of the page while it checks and says
 * how that went. A zero-height box, so the page below never moves; the
 * scroller clips the pill until it has come down. The live region stays
 * mounted, so each change is announced.
 */
export const PullIndicator = ({
  phase,
  when,
}: {
  phase: Phase
  /** A moment as the time of day; the phone's own clock format by default. */
  when?: (at: number) => string
}): JSX.Element => {
  const words = pullWords(phase, when)
  const distance =
    phase.kind === "pulling" || phase.kind === "armed" ? phase.distance : ARM_PX
  return (
    <div className="relative h-0" data-pull-indicator="">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${distance - ARM_PX}px)`,
          opacity: Math.min(1, distance / ARM_PX),
        }}
      >
        {words !== null && (
          <p className="bg-background text-foreground flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-md">
            <PhaseIcon phase={phase} />
            <span>{words}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Listens for drags on its parent, the page scroller, while mounted, and
 * shows how the pull goes. A pull reads again the queries on screen and the
 * route's loaders (`lib/pull-refresh/reads`); it never reloads the page (D3).
 */
export const PullToCheck = (): JSX.Element => {
  const router = useRouter()
  const queryClient = useQueryClient()
  // Made once per mount: the router and the cache are the app's singletons.
  const [runtime] = useState(() =>
    createPullRuntime(readsOnScreen(queryClient, router, onlineManager))
  )
  const { phase } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getState,
    runtime.getState
  )
  const anchor = useCallback(
    (element: HTMLElement | null) => {
      const scroller = element?.parentElement
      return scroller ? runtime.attach(scroller) : undefined
    },
    [runtime]
  )
  return (
    <div ref={anchor} className="contents">
      <PullIndicator phase={phase} />
    </div>
  )
}
