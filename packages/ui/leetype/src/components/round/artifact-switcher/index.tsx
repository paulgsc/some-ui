import type { FC, KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * Def. 9.2's six artifacts, one id per letter of `(A, C, B, D, P, r)`:
 *
 * - `"algorithm"`: `A` (`SourcePanel`).
 * - `"constraintDiff"`: `C`, rendered as `(C, C′)` by `ConstraintDiff`.
 * - `"budget"`: `B` (`BudgetDisplay`).
 * - `"diffSet"`: `D`, the diff set (Def. 1.4/1.6).
 * - `"optionSet"`: the option set drawn from `P` (`RoundChoices`).
 * - `"runResult"`: `r` (`RunResult`).
 */
export type ArtifactId =
  | "algorithm"
  | "constraintDiff"
  | "budget"
  | "diffSet"
  | "optionSet"
  | "runResult"

/**
 * One artifact, as data: an id (position tracking only), a short label for
 * the header and screen-reader announcement, and the rendered `content`,
 * which this component never inspects.
 */
export type SwitchableArtifact = {
  readonly id: ArtifactId
  readonly label: string
  readonly content: ReactNode
}

type ArtifactSwitcherProps = {
  /**
   * Def. 9.2's artifact set in display order, already filtered to what the
   * round's phase makes available. An unreached artifact is absent; there is
   * no "disabled" state ("unavailability is absence, never a disabled control
   * that hints at what is coming").
   */
  artifacts: ReadonlyArray<SwitchableArtifact>
  /**
   * An opaque round-identity token. Compared during render ("adjust state
   * during render", as `SourcePanel` does): when it changes, position resets
   * to the first artifact before anything paints. Callers may keep one
   * instance mounted across rounds rather than remounting via `key`.
   */
  roundId: string
  /**
   * Read by assistive tech on the hidden position announcement and, when
   * supplied, folded into the Previous/Next names (`"<ariaLabel>: previous
   * artifact"`) so two side-by-side instances (`WideRoundSurface`) have
   * distinguishable controls. Unset, the buttons are "Previous artifact" /
   * "Next artifact".
   */
  ariaLabel?: string
  /**
   * The artifact to bring into view, when it changes. A round reveals
   * artifacts as it goes (no option set before a diff is picked), and the
   * one just revealed is the one the learner needs next. Compared during
   * render against what was last seen, like `roundId`, but moving position
   * without remounting anything, so an artifact's own state (a committed
   * `RoundChoices`) survives the move. An id not in `artifacts` is ignored.
   */
  focusId?: ArtifactId
  /**
   * A control beside the tabs (or the narrow header's label), given the
   * artifact showing now: `RoundSession`'s Note button (canon Rem. 3.7),
   * which raises a note on whatever is current. Rendered once, outside the
   * tab list, so it is never one of the tabs.
   */
  renderHeaderAction?: (current: SwitchableArtifact) => ReactNode
  /**
   * Content between the header and the pager, such as the open note: it
   * pushes the artifact down rather than covering it.
   */
  headerPanel?: ReactNode
  className?: string
}

/**
 * Which slots hold their artifact's content: the current one, every one
 * visited this round, and the current one's two neighbours. The neighbours
 * are there so a swipe drags real content into view rather than an empty
 * slot that fills in once the gesture settles.
 */
function mountedSlotIds(
  artifacts: ReadonlyArray<SwitchableArtifact>,
  index: number,
  visited: ReadonlySet<ArtifactId>
): ReadonlySet<ArtifactId> {
  const ids = new Set(visited)
  for (const offset of [-1, 0, 1]) {
    const artifact = artifacts[index + offset]
    if (artifact !== undefined) ids.add(artifact.id)
  }
  return ids
}

/**
 * The page a pager rests on, or `null` when it has no width to say (not laid
 * out yet, or a test environment without layout).
 */
function pageInView(pager: HTMLElement | null): number | null {
  if (!pager || pager.clientWidth === 0) return null
  return Math.round(pager.scrollLeft / pager.clientWidth)
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Def. 9.2 / Rem. 9.2: the switcher owning "which of the six artifacts is in
 * view", the `CodeDisplay` posture one level up. It knows nothing about
 * answers, commitments or ledgers and draws whichever `content` it is
 * handed. `artifacts[number].id` is read only to find the current position,
 * decide what stays mounted and name tab/panel pairs; there is no
 * `switch (id)`, so a seventh artifact costs its caller one array entry.
 *
 * # A pager the finger drives
 *
 * Artifacts sit side by side in one native horizontal scroller with
 * mandatory snapping, one per page, so a swipe is the platform's own scroll
 * and needs no gesture code. Position is read back from the scroller, so a
 * swipe, tab press, arrow press and `focusId` all land in the one
 * `activeId`; there is no swipe-only or press-only transition. The pager
 * grows to fill the caller's height so the whole area is swipeable.
 *
 * # Phones get labelled tabs; wide screens keep arrows and dots
 *
 * Below `md` the header is a row of tabs naming every artifact (a dot has no
 * name). From `md` up it keeps chevron buttons (`type="button"`; disabled at
 * the ends of the *current* set) and dots. Both headers are always in the
 * DOM and CSS shows one, so tests reach the same buttons at any width.
 *
 * # A scrolling artifact keeps its own horizontal scroll
 *
 * The browser gives a horizontal gesture to the innermost scroller that can
 * still move, so a long line in `SourcePanel` or `DiffCard` scrolls first and
 * only then does a swipe page. `overscroll-behavior-x: contain` keeps the
 * last page from triggering the browser's back gesture.
 *
 * # No round state
 *
 * `activeId` and `visitedIds` name positions, never an answer; the
 * component would render identically with placeholder `content`.
 *
 * # Switching away never unmounts; it makes inert
 *
 * An artifact's content may hold one-shot state (`RoundChoices`'
 * `committed`); remounting it would re-arm a spent commitment. So every
 * artifact shown this round stays mounted (`visitedIds`), as do the current
 * one's neighbours (so a swipe drags real content). Every slot but the
 * current is `inert` and `aria-hidden`, so exactly one is load-bearing
 * (Def. 9.2) to a learner or screen reader. Other slots are laid out but
 * empty. `visitedIds` clears on a round advance, and slots are keyed on
 * `` `${roundId}:${artifact.id}` `` so even an artifact at the same id and
 * position remounts: React would otherwise update a same-key child in place
 * and carry its state across rounds.
 */
export const ArtifactSwitcher: FC<ArtifactSwitcherProps> = ({
  artifacts,
  roundId,
  ariaLabel,
  focusId,
  renderHeaderAction,
  headerPanel,
  className,
}) => {
  const announceLabel = ariaLabel ?? "Round artifact"
  const previousLabel = ariaLabel
    ? `${ariaLabel}: previous artifact`
    : "Previous artifact"
  const nextLabel = ariaLabel ? `${ariaLabel}: next artifact` : "Next artifact"
  const baseId = useId()

  const [seenRoundId, setSeenRoundId] = useState(roundId)
  const [activeId, setActiveId] = useState<ArtifactId | null>(
    artifacts[0]?.id ?? null
  )
  const [visitedIds, setVisitedIds] = useState<ReadonlySet<ArtifactId>>(
    () => new Set(artifacts[0] ? [artifacts[0].id] : [])
  )
  if (roundId !== seenRoundId) {
    setSeenRoundId(roundId)
    setActiveId(artifacts[0]?.id ?? null)
    setVisitedIds(new Set(artifacts[0] ? [artifacts[0].id] : []))
  }
  const [seenFocusId, setSeenFocusId] = useState(focusId)
  if (focusId !== seenFocusId) {
    setSeenFocusId(focusId)
    if (
      focusId !== undefined &&
      artifacts.some((artifact) => artifact.id === focusId)
    ) {
      setActiveId(focusId)
    }
  }

  // Derived: an id no longer in `artifacts` (defensive) falls back to the first.
  const rawIndex = artifacts.findIndex((artifact) => artifact.id === activeId)
  const index = rawIndex === -1 ? 0 : rawIndex
  const current = artifacts[index]

  // Joins the visited set during render, so its first paint is not empty.
  if (current !== undefined && !visitedIds.has(current.id)) {
    setVisitedIds(new Set([...visitedIds, current.id]))
  }
  const mountedIds = mountedSlotIds(artifacts, index, visitedIds)

  const goTo = (nextIndex: number): void => {
    const clamped = Math.max(0, Math.min(artifacts.length - 1, nextIndex))
    const next = artifacts[clamped]
    if (next !== undefined) setActiveId(next.id)
  }

  const pagerRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const currentContentRef = useRef<HTMLDivElement>(null)
  // The round the pager was last scrolled for: a round advance jumps to the
  // first artifact instead of scrolling back through the old round's.
  const scrolledRoundRef = useRef(roundId)
  // The page a scroll this component started is heading to, until it gets
  // there (see `followPager`).
  const headingToRef = useRef<number | null>(null)
  const [currentHeight, setCurrentHeight] = useState(0)

  // A swipe moves the scroller; this moves `activeId` to match. A press
  // moves `activeId`; the effect below moves the scroller to match. Each
  // checks the other first, so neither ever echoes the other's move back.
  //
  // While a press's smooth scroll is on its way, the pages it passes are
  // not choices: reading them back would move `activeId` to each in turn,
  // and the first one would turn the scroll back where it came from. So a
  // scroll this component started is ignored until it arrives, until a
  // finger takes the pager over, or until it comes to rest anywhere at all
  // (`scrollend`): wherever the pager settles is then the truth, so a scroll
  // that stops short can never leave the tabs naming a page nobody sees.
  const followPager = (settled: boolean): void => {
    const page = pageInView(pagerRef.current)
    if (page === null) return
    if (headingToRef.current !== null) {
      if (page !== headingToRef.current && !settled) return
      headingToRef.current = null
    }
    const artifact = artifacts[page]
    if (artifact !== undefined && artifact.id !== activeId) {
      setActiveId(artifact.id)
    }
  }

  useLayoutEffect(() => {
    const pager = pagerRef.current
    const jump = scrolledRoundRef.current !== roundId
    scrolledRoundRef.current = roundId
    if (!pager || pageInView(pager) === index) return
    const left = index * pager.clientWidth
    if (typeof pager.scrollTo !== "function") {
      pager.scrollLeft = left
      return
    }
    headingToRef.current = index
    pager.scrollTo({
      left,
      behavior: jump || prefersReducedMotion() ? "instant" : "smooth",
    })
  }, [index, roundId])

  // Keep the current tab in view when there are more tabs than fit, by
  // scrolling the tab row only: `scrollIntoView` would also scroll the page
  // back up to the tabs, away from what the learner was reading.
  useLayoutEffect(() => {
    const list = tabListRef.current
    const tab = list?.children[index]
    if (!list || !(tab instanceof HTMLElement)) return
    if (list.scrollWidth <= list.clientWidth) return
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ left, behavior: "smooth" })
    }
  }, [index])

  // The pager is as tall as the current artifact (or as the caller's room,
  // if that is more), never as tall as the tallest one: a long option set
  // on the next page must not leave blank page to scroll through under a
  // short budget. Measured rather than left to CSS because a flex row is
  // always as tall as its tallest child; the measurement is the pager's
  // flex basis, so it is also what the pager reports as its own height to
  // a caller sizing itself from its content.
  const currentKey = current === undefined ? null : current.id
  useEffect(() => {
    const content = currentContentRef.current
    if (!content || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      setCurrentHeight(content.offsetHeight)
    })
    observer.observe(content)
    return (): void => observer.disconnect()
  }, [currentKey, roundId])

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? artifacts.length - 1
          : index + step
    if (target === index || target < 0 || target >= artifacts.length) return
    event.preventDefault()
    goTo(target)
    const tab = tabListRef.current?.children[target]
    if (tab instanceof HTMLElement) tab.focus()
  }

  if (current === undefined) return null

  const tabId = (artifact: SwitchableArtifact): string =>
    `${baseId}-tab-${artifact.id}`
  const panelId = (artifact: SwitchableArtifact): string =>
    `${baseId}-panel-${artifact.id}`

  return (
    <div className={cn("flex w-full min-w-0 flex-col", className)}>
      <div className="flex min-w-0 shrink-0 items-stretch">
        {artifacts.length > 1 && (
          <div
            ref={tabListRef}
            role="tablist"
            aria-label={announceLabel}
            className="flex min-w-0 flex-1 shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border/60 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
          >
            {artifacts.map((artifact, position) => {
              const selected = position === index
              return (
                <button
                  key={artifact.id}
                  id={tabId(artifact)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId(artifact)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => goTo(position)}
                  onKeyDown={handleTabKeyDown}
                  className={cn(
                    "-mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground"
                  )}
                >
                  {artifact.label}
                </button>
              )
            })}
          </div>
        )}

        <div
          className={cn(
            "hidden min-w-0 flex-1 items-center justify-between gap-2 md:flex",
            artifacts.length === 1 && "flex"
          )}
        >
          <button
            type="button"
            aria-label={previousLabel}
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-30 enabled:hover:bg-card/70 enabled:hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="max-w-full truncate text-xs font-medium text-muted-foreground">
              {current.label}
            </span>
            {artifacts.length > 1 && (
              <span aria-hidden="true" className="flex items-center gap-1.5">
                {artifacts.map((artifact) => (
                  <span
                    key={artifact.id}
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      artifact.id === current.id ? "bg-foreground" : "bg-border"
                    )}
                  />
                ))}
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label={nextLabel}
            disabled={index === artifacts.length - 1}
            onClick={() => goTo(index + 1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-30 enabled:hover:bg-card/70 enabled:hover:text-foreground"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        {renderHeaderAction !== undefined && (
          <div
            className={cn(
              "flex shrink-0 items-center pl-1",
              artifacts.length > 1 && "border-b border-border/60 md:border-b-0"
            )}
          >
            {renderHeaderAction(current)}
          </div>
        )}
      </div>

      {headerPanel}

      {/* Which artifact is current, and where, said in words for a screen
          reader — `aria-live="polite"` so a swipe or a press is announced
          without stealing focus. The tabs carry the same fact as
          `aria-selected`, but only while focus is on them. */}
      <p aria-live="polite" className="sr-only">
        {announceLabel}: {current.label}, {index + 1} of {artifacts.length}
      </p>

      <div
        ref={pagerRef}
        onScroll={() => followPager(false)}
        onScrollEnd={() => followPager(true)}
        onPointerDown={() => {
          headingToRef.current = null
        }}
        style={{ flexBasis: currentHeight }}
        className="mt-3 flex min-w-0 shrink-0 grow snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {artifacts.map((artifact) => {
          const isCurrent = artifact.id === current.id
          return (
            // Keyed on `roundId` too, so every slot remounts on a round change
            // (see the component doc comment).
            <div
              key={`${roundId}:${artifact.id}`}
              id={panelId(artifact)}
              role="tabpanel"
              aria-labelledby={
                artifacts.length > 1 ? tabId(artifact) : undefined
              }
              aria-label={artifacts.length > 1 ? undefined : artifact.label}
              aria-hidden={isCurrent ? undefined : true}
              inert={!isCurrent}
              className="w-full min-w-0 shrink-0 snap-start"
            >
              {mountedIds.has(artifact.id) && (
                <div ref={isCurrent ? currentContentRef : undefined}>
                  {artifact.content}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
