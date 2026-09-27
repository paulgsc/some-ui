import type { ComponentType, JSX, RefObject } from "react"
import { useEffect, useState } from "react"
import type { Pane } from "@lesson-crm/lib/panes"
import { PANE_LABELS } from "@lesson-crm/lib/panes"
import {
  FileText,
  List,
  ListChecks,
  MessagesSquare,
  Sparkles,
  Tags,
} from "lucide-react"
import { cn } from "some-ui-utils"

const ICONS: Record<Pane, ComponentType<{ className?: string }>> = {
  lessons: List,
  prompt: Sparkles,
  lesson: FileText,
  details: Tags,
  preview: MessagesSquare,
  check: ListChecks,
}

/** Scroll this far before the bar changes its mind: a jitter is not a direction. */
const SCROLL_SLOP = 8

/**
 * Whether the bar should show: hidden while the content scrolls down, shown
 * again the moment it scrolls up, or reaches its top - the pattern a phone's
 * video app uses for its bottom bar.
 *
 * Listens at `scope` in the capture phase, because a pane's scrolling is
 * inside it (the lesson's text box, the preview's chat), and `scroll` does
 * not bubble. Each scroller's last position is kept separately, so switching
 * which box is scrolling never reads as a jump.
 */
export function useShowOnScrollUp(
  scope: RefObject<HTMLElement | null>,
  /** Anything that should bring the bar back: the pane changing. */
  resetKey: unknown
): boolean {
  const [shown, setShown] = useState(true)
  const [lastKey, setLastKey] = useState(resetKey)
  if (lastKey !== resetKey) {
    setLastKey(resetKey)
    setShown(true)
  }

  useEffect(() => {
    const root = scope.current
    if (!root) return
    const last = new WeakMap<EventTarget, number>()
    const onScroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const top = target.scrollTop
      const before = last.get(target) ?? 0
      if (top <= 0) {
        last.set(target, 0)
        setShown(true)
        return
      }
      if (Math.abs(top - before) < SCROLL_SLOP) return
      last.set(target, top)
      setShown(top < before)
    }
    root.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return (): void => {
      root.removeEventListener("scroll", onScroll, { capture: true })
    }
  }, [scope])

  return shown
}

type PaneTabBarProps = {
  panes: Array<Pane>
  current: Pane
  /** Panes that need a lesson open first. */
  disabled: (pane: Pane) => boolean
  shown: boolean
  onPane: (pane: Pane) => void
}

/**
 * The phone's bottom tab bar, one tab per pane.
 *
 * Hidden, it collapses to nothing rather than sliding over the content: a
 * persistent affordance may not paint over what it cannot see
 * (`apps/www` `docs/session-viewport/05-the-mobile-shell.md` §4), so the
 * space it gives up goes to the pane, and while shown it has its own strip.
 * Focus reaching a tab inside it brings it back, so a keyboard never lands
 * on something invisible.
 */
export const PaneTabBar = ({
  panes,
  current,
  disabled,
  shown,
  onPane,
}: PaneTabBarProps): JSX.Element => (
  <div
    data-shown={shown}
    className={cn(
      "grid shrink-0 transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
      shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
    )}
  >
    <div className="min-h-0 overflow-hidden">
      <div
        role="tablist"
        aria-label="Lesson panes"
        className="border-border bg-background flex border-t"
      >
        {panes.map((pane) => {
          const Icon = ICONS[pane]
          return (
            <button
              key={pane}
              type="button"
              role="tab"
              id={`lesson-tab-${pane}`}
              aria-selected={pane === current}
              aria-controls={`lesson-pane-${pane}`}
              disabled={disabled(pane)}
              tabIndex={shown ? 0 : -1}
              onClick={() => onPane(pane)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] disabled:opacity-40",
                pane === current ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon
                className={cn("size-5", pane === current && "text-primary")}
              />
              {PANE_LABELS[pane]}
            </button>
          )
        })}
      </div>
    </div>
  </div>
)
