import type { FC, KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * Def. 9.2's own six artifacts, one id per letter of the tuple
 * `(A, C, B, D, P, r)` — descriptive rather than single-letter, since these
 * ids are read in Storybook titles, test names and (eventually) a real
 * caller's own code, not just this file:
 *
 * - `"algorithm"` — `A`, `SourcePanel`'s own prop (R1, #1204).
 * - `"constraintDiff"` — `C`, rendered as `(C, C′)` by `ConstraintDiff` (R3, #1206).
 * - `"budget"` — `B`, `BudgetDisplay` (R2, #1205).
 * - `"diffSet"` — `D`, Def. 1.4/1.6's diff set (R4, #1207); no dedicated
 *   renderer exists yet — "what each artifact looks like inside" is this
 *   story's own declared out-of-scope, D included.
 * - `"optionSet"` — the presented option set drawn from `P`, `RoundChoices`
 *   (B2/B3, #1219/#1220).
 * - `"runResult"` — `r`, `RunResult` (X1, #1222); no dedicated renderer
 *   exists yet either (X2, #1223, is a later, independent story).
 */
export type ArtifactId =
  | "algorithm"
  | "constraintDiff"
  | "budget"
  | "diffSet"
  | "optionSet"
  | "runResult"

/**
 * One artifact, as data: an id (for position-tracking only — see this
 * file's own doc comment on why the switcher never reads it for anything
 * else), a short label for the header and the screen-reader position
 * announcement, and the already-rendered content. `content` is opaque:
 * this component never inspects it, mirroring `CodeDisplay`'s own
 * "contains no vocabulary from any of them" invariant one level up.
 */
export type SwitchableArtifact = {
  readonly id: ArtifactId
  readonly label: string
  readonly content: ReactNode
}

type ArtifactSwitcherProps = {
  /**
   * Def. 9.2's artifact set, already filtered to what the round's current
   * phase makes available (there is no `r` before a run, no option set
   * before a commitment) — display order. An artifact the round has not
   * reached yet is simply absent from this array; this component has no
   * concept of "disabled" and never renders one, by construction rather
   * than by a flag a caller could get wrong (the acceptance criterion this
   * satisfies: "unavailability is absence, never a disabled control that
   * hints at what is coming").
   */
  artifacts: ReadonlyArray<SwitchableArtifact>
  /**
   * An opaque round-identity token — not round content, and not read for
   * anything but this comparison. Compared during render against what was
   * last seen, the same "adjust state during render" idiom `SourcePanel`
   * already uses for `algorithm.source` (R1, #1204): the instant this
   * differs from the previous render, position resets to the first
   * available artifact before anything paints, with no stale frame shown
   * at the old position first. A caller may keep the same `ArtifactSwitcher`
   * instance mounted across rounds (the same reason `SourcePanel` keeps
   * this idiom rather than relying on a caller remounting via `key`) —
   * `ReadingSession` already does exactly this with `DiffCard`'s own
   * `hunk` prop, swapping content on an already-mounted instance rather
   * than remounting it.
   */
  roundId: string
  /**
   * Read only by assistive tech, on the visually-hidden position
   * announcement — and, when explicitly supplied, folded into the Previous/
   * Next buttons' own accessible names too (`"<ariaLabel>: previous
   * artifact"`), not just left as this component's own generic "Previous
   * artifact"/"Next artifact" (review finding, #1439, chatgpt-codex-
   * connector: a caller mounting two instances side by side, as `WideRound
   * Surface` does post-commitment, otherwise leaves screen-reader and
   * voice-control users with two pairs of identically-named controls and no
   * way to tell which switcher a navigation action targets). Left `undefined`
   * — the common case, every caller before `WideRoundSurface` — the button
   * labels stay exactly "Previous artifact"/"Next artifact", unchanged.
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
 * Def. 9.2 / Rem. 9.2 (C1, #1213): the switcher owning "which of the six
 * artifacts is in view" — the `CodeDisplay` posture (`components/typing-
 * game/code-display`) one level up. `CodeDisplay` "knows nothing about
 * exercises, prompts, steps or competencies" and "draws what it is
 * handed"; this component knows nothing about answers, commitments or
 * ledgers, and draws whichever `content` it is handed for the artifact
 * currently in view. `artifacts[number].id` is read for exactly three
 * purposes — finding the current artifact's position after a re-render,
 * testing Set membership to decide what stays mounted, and naming each
 * tab/panel pair for assistive tech — never to branch rendering or
 * interaction on which artifact it is. There is no `switch (id)` anywhere
 * in this file, and there should never need to be one: a seventh artifact
 * some future story adds costs its caller one more array entry, not a
 * change here.
 *
 * # A pager the finger drives, not a slideshow with buttons
 *
 * The artifacts sit side by side in one native horizontal scroller with
 * mandatory scroll snapping, one artifact per page. A swipe is therefore
 * the platform's own scroll: the content follows the finger, flings and
 * settles the way every other pager on the phone does, and needs no
 * gesture code here. Position is read back from the scroller (`onScroll`),
 * so a swipe, a tab press, an arrow press and a `focusId` move all land in
 * the one `activeId`, and the effect below scrolls the pager to wherever
 * `activeId` says when something other than the scroller moved it. There is
 * no swipe-only or press-only transition (the literal acceptance criterion:
 * "a swipe that means something no press can mean is a keyboard by another
 * name").
 *
 * The pager grows to fill whatever height its caller gives it, so the whole
 * screen below the tabs is something to swipe on, not just the few lines a
 * short artifact like the budget draws.
 *
 * # Phones get labelled tabs; wide screens keep arrows and dots
 *
 * Below `md` the header is a row of tabs naming every artifact, with the
 * current one marked: on a phone the swipe is the expected affordance, and
 * dots plus a pair of chevrons said less (a dot has no name) while taking
 * the same row. From `md` up, where a pointer and not a thumb is the usual
 * input, the header keeps its chevron buttons (`type="button"`, so a
 * mounted `<form>` upstream never submits on press; disabled at the ends,
 * a real boundary of the *current* set, not a hint about an artifact that
 * does not exist right now) and the dots. Both headers are always in the
 * DOM and CSS shows one, so the same buttons are reachable by role in a
 * test at any width.
 *
 * # A scrolling artifact keeps its own horizontal scroll
 *
 * LTY-MOBILE's rule, kept verbatim: "the code region scrolls horizontally
 * inside itself, the page does not." With a native pager this needs no
 * code either. The browser gives a horizontal gesture to the innermost
 * scroller that can still move that way, so dragging a long line in
 * `SourcePanel` or `DiffCard` reads past its edge; only once that region is
 * at its edge does a new swipe page between artifacts. The pager sets
 * `overscroll-behavior-x: contain`, so swiping past the last artifact never
 * becomes the browser's own back gesture.
 *
 * # No round state
 *
 * `activeId` and `visitedIds` are the only state this component owns, and
 * both name positions, never an answer. Nothing here reads a commitment, a
 * ledger, or `runResult`'s own `ok`/`error` discriminant — the artifacts
 * array is opaque `content`, and this component would render identically
 * if every artifact's `content` were replaced with a fixed placeholder.
 *
 * # Switching away never unmounts — it makes inert
 *
 * An artifact's own `content` may hold state that only exists once, the
 * same way `RoundChoices`'s one-shot `committed` does (review finding on
 * #1430, chatgpt-codex-connector): unmounting it on a switch would mount a
 * fresh instance on switching back, silently re-arming an already-spent
 * commitment. So every artifact this switcher has ever shown *this round*
 * stays mounted — `visitedIds` grows as `activeId` visits new positions —
 * and so do the current artifact's neighbours, so a swipe has something to
 * drag in. Every slot but the current one is `inert` and `aria-hidden`: out
 * of the tab order and the accessibility tree, so this is still "exactly
 * one is load-bearing," Def. 9.2, in every way a learner or a screen reader
 * can observe. A slot that is neither visited nor next to the current one
 * is laid out (the pager's page positions need its width) but empty, so an
 * artifact two swipes away still costs nothing. `visitedIds` clears with
 * everything else on a round advance — carrying a previous round's mounted
 * instances forward would reintroduce the identical staleness one round
 * later, since not every artifact's own content resets itself on a prop
 * change the way `SourcePanel` does for `algorithm.source`.
 *
 * Clearing `visitedIds` alone is not sufficient, and was itself a review
 * finding (#1430, chatgpt-codex-connector, round 2): consecutive rounds
 * typically share a first artifact id (`algorithm` is first every round),
 * so that one child sits at the same keyed position before and after a
 * round change, and React reconciles a same-key same-type child by
 * updating its props rather than remounting it — carrying local state
 * across the round boundary regardless of what this component's own
 * bookkeeping reset. Every slot is therefore keyed on
 * `` `${roundId}:${artifact.id}` ``, not `artifact.id` alone, so a round
 * change always produces a genuinely new key and a genuine remount, even
 * for an artifact whose id and position did not change.
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

  // Derived, never stored: an id that no longer appears in `artifacts` (a
  // defensive case, not one a monotonically-revealing round should ever
  // produce) falls back to the first artifact rather than an out-of-bounds
  // index, without this component having to remember it was ever wrong.
  const rawIndex = artifacts.findIndex((artifact) => artifact.id === activeId)
  const index = rawIndex === -1 ? 0 : rawIndex
  const current = artifacts[index]

  // The current artifact joins the visited set the instant it becomes
  // current — synchronously during render, the same "adjust state during
  // render" idiom the round-reset above uses, so the very first paint of a
  // newly-active artifact already includes it rather than a frame of
  // nothing.
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
            // Keyed on `roundId` too, not just `artifact.id` (review finding
            // on #1430, chatgpt-codex-connector): consecutive rounds sharing
            // a first artifact id (the common case — `algorithm` is
            // typically first every round) would otherwise keep that one
            // child at the same keyed position across a round change, and
            // React reconciles same-key same-type children by updating
            // props rather than remounting — carrying its local state into
            // the new round despite `visitedIds`/`activeId` both having
            // reset. Prefixing the key with `roundId` guarantees every
            // child gets a genuinely new key the instant the round changes,
            // so "resets on round advance" holds for a child's own state,
            // not just for this component's position bookkeeping.
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
