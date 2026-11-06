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
import { Notice } from "@some-ui/shared"
import { onlineManager, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { ArrowDown, Check, CircleAlert, RefreshCw } from "lucide-react"

import { writeNativeLog } from "@/lib/native-log"
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

/** The phase's icon and words, as the pill and the notice both say them. */
const Said = ({
  phase,
  words,
}: {
  phase: Phase
  words: string
}): JSX.Element => (
  <span data-pull-words="" className="flex items-center gap-2 text-balance">
    <PhaseIcon phase={phase} />
    <span>{words}</span>
  </span>
)

/**
 * The indicator for `phase`. While the finger pulls, a pill comes down from
 * under the header with it: a zero-height box, so the page below never
 * moves, and the scroller clips the pill until it has come down. Once let
 * go, how the check goes (checking, done, failed) is said over the screen
 * (`Notice`), as everything a screen says about what was just done is (HS1).
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
  const pulling = phase.kind === "pulling" || phase.kind === "armed"
  const distance = pulling ? phase.distance : ARM_PX
  return (
    <>
      <div className="relative h-0" data-pull-indicator="">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
          style={{
            transform: `translateY(${distance - ARM_PX}px)`,
            opacity: Math.min(1, distance / ARM_PX),
          }}
        >
          {pulling && words !== null && (
            <p className="bg-background text-foreground max-w-full rounded-2xl border px-3 py-1.5 text-sm shadow-md">
              <Said phase={phase} words={words} />
            </p>
          )}
        </div>
      </div>
      {!pulling && words !== null && (
        <Notice role="status">
          <Said phase={phase} words={words} />
        </Notice>
      )}
    </>
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
    createPullRuntime({
      ...readsOnScreen(queryClient, router, onlineManager),
      note: writeNativeLog,
    })
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
