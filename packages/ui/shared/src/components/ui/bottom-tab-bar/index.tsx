import type { ComponentType, FocusEvent, JSX } from "react"
import { useState } from "react"

import { cn } from "../../../lib/utils"

export type BottomTab<Id extends string> = {
  id: Id
  label: string
  icon: ComponentType<{ className?: string }>
  /** A tab that cannot be opened yet (it needs something chosen first). */
  disabled?: boolean
  /** How much the tab holds, worn over its icon when above zero. */
  badge?: number
}

type BottomTabBarProps<Id extends string> = {
  tabs: ReadonlyArray<BottomTab<Id>>
  current: Id
  onChange: (id: Id) => void
  /** See `useShowOnScrollUp` (some-ui-utils): hidden, the bar takes no room. */
  shown: boolean
  /** Names the tablist for assistive tech ("Lesson panes"). */
  label: string
  /**
   * Prefix of the ids a tab and its panel share: a tab is `${idPrefix}-tab-${id}`
   * and controls `${idPrefix}-pane-${id}`, which is what the panel itself
   * must be given.
   */
  idPrefix: string
}

/**
 * A phone's bottom tab bar, one tab per concern - the shape a video app uses
 * to keep its sections apart: each tab is a whole pane of its own, and
 * switching between them is the navigation, not a Back and a Continue.
 *
 * Hidden, it collapses to nothing rather than sliding over the content: a
 * persistent affordance may not paint over what it cannot see
 * (`docs/session-viewport/05-the-mobile-shell.md` §4), so the space
 * it gives up goes to the pane, and while shown it has its own strip. It
 * stays shown while a tab inside it holds focus, whatever `shown` says, so
 * a tab pressed and then scrolled away from never becomes focus nobody can
 * see, and the keyboard's next move does not start from a hidden control.
 * Hidden tabs leave the tab order (`tabIndex -1`), so focus only arrives
 * while the bar is visible.
 */
export const BottomTabBar = <Id extends string>({
  tabs,
  current,
  onChange,
  shown,
  label,
  idPrefix,
}: BottomTabBarProps<Id>): JSX.Element => {
  const [holdsFocus, setHoldsFocus] = useState(false)
  const visible = shown || holdsFocus

  return (
    <div
      data-shown={visible}
      onFocus={() => setHoldsFocus(true)}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setHoldsFocus(false)
        }
      }}
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
        visible ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          role="tablist"
          aria-label={label}
          className="border-border bg-background flex border-t"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const badge = tab.badge ?? 0
            const active = tab.id === current
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`${idPrefix}-pane-${tab.id}`}
                aria-label={badge > 0 ? `${tab.label}, ${badge}` : undefined}
                disabled={tab.disabled}
                tabIndex={visible ? 0 : -1}
                onClick={() => onChange(tab.id)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] disabled:opacity-40",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className={cn("size-5", active && "text-primary")} />
                  {badge > 0 && (
                    <span
                      aria-hidden
                      className="bg-primary text-primary-foreground absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none"
                    >
                      {badge}
                    </span>
                  )}
                </span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
