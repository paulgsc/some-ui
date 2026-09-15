import type { FC, ReactNode, TouchEvent as ReactTouchEvent } from "react"
import { useRef, useState } from "react"
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
  /** Read only by assistive tech, on the visually-hidden position announcement. Defaults to a generic label since this component has no idea what round it is part of. */
  ariaLabel?: string
  className?: string
}

/**
 * Large enough that the few stray pixels of a vertical scroll's initial
 * wobble never register as a switch; small enough that a real swipe does
 * not need to travel edge to edge.
 */
const SWIPE_THRESHOLD_PX = 40

/**
 * Def. 9.2 / Rem. 9.2 (C1, #1213): the switcher owning "which of the six
 * artifacts is in view" — the `CodeDisplay` posture (`components/typing-
 * game/code-display`) one level up. `CodeDisplay` "knows nothing about
 * exercises, prompts, steps or competencies" and "draws what it is
 * handed"; this component knows nothing about answers, commitments or
 * ledgers, and draws whichever `content` it is handed for the artifact
 * currently in view. `artifacts[number].id` is read for exactly two
 * purposes — finding the current artifact's position after a re-render,
 * and testing Set membership to decide what stays mounted — never to
 * branch rendering or interaction on which artifact it is. There is no
 * `switch (id)` anywhere in this file, and there should never need to be
 * one: a seventh artifact some future story adds costs its caller one
 * more array entry, not a change here.
 *
 * # Press and swipe, and neither is the only way
 *
 * Two chevron buttons (`type="button"`, so a mounted `<form>` upstream
 * never submits on tap) move by exactly one position and are disabled at
 * the ends — a real boundary of the *current* set, not a hint about an
 * artifact that does not exist right now. A horizontal touch drag past
 * `SWIPE_THRESHOLD_PX` does the same, in the same direction a reader
 * already expects (drag left reveals what is to the right, the same
 * convention every paging surface on a phone already uses). Both call the
 * identical `goTo` — there is no swipe-only or press-only transition, the
 * literal acceptance criterion ("a swipe that means something no press can
 * mean is a keyboard by another name").
 *
 * # The swipe defers to a scrolling artifact's own horizontal scroll
 *
 * LTY-MOBILE's rule, kept verbatim: "the code region scrolls horizontally
 * inside itself, the page does not." A touch that starts inside a
 * descendant marked `data-scroll-intent` (`DiffCard`, `TypingViewport`,
 * and any future artifact content doing the same) is never tracked as a
 * switch candidate at all — the native scroller gets the whole gesture,
 * untouched. This is a property of *where a touch starts*, not of which
 * artifact is showing, so it costs no per-artifact branch either: any
 * content, from any artifact, that declares its own horizontal scroll
 * region is exempted the same way.
 *
 * # No round state
 *
 * `activeId` and `mountedIds` are the only state this component owns, and
 * both name positions, never an answer. Nothing here reads a commitment, a
 * ledger, or `runResult`'s own `ok`/`error` discriminant — the artifacts
 * array is opaque `content`, and this component would render identically
 * if every artifact's `content` were replaced with a fixed placeholder.
 *
 * # Switching away never unmounts — it hides
 *
 * An artifact's own `content` may hold state that only exists once, the
 * same way `RoundChoices`'s one-shot `committed` does (review finding on
 * #1430, chatgpt-codex-connector): rendering only `current.content` would
 * unmount that state the instant a learner switched away and mount a fresh
 * instance on switching back, silently re-arming an already-spent
 * commitment. So every artifact this switcher has ever shown *this round*
 * stays mounted — `mountedIds` grows as `activeId` visits new positions —
 * and only the current one is unhidden, via the plain `hidden` attribute
 * (out of layout and the accessibility tree both, so this is still
 * "exactly one is load-bearing," Def. 9.2, in every way a learner or a
 * screen reader can observe). An artifact never visited this round is
 * never mounted at all, so a `runResult` nobody has looked at yet still
 * costs nothing. `mountedIds` clears with everything else on a round
 * advance — carrying a previous round's mounted instances forward would
 * reintroduce the identical staleness one round later, since not every
 * artifact's own content resets itself on a prop change the way
 * `SourcePanel` does for `algorithm.source`.
 */
export const ArtifactSwitcher: FC<ArtifactSwitcherProps> = ({
  artifacts,
  roundId,
  ariaLabel = "Round artifact",
  className,
}) => {
  const [seenRoundId, setSeenRoundId] = useState(roundId)
  const [activeId, setActiveId] = useState<ArtifactId | null>(
    artifacts[0]?.id ?? null
  )
  const [mountedIds, setMountedIds] = useState<ReadonlySet<ArtifactId>>(
    () => new Set(artifacts[0] ? [artifacts[0].id] : [])
  )
  if (roundId !== seenRoundId) {
    setSeenRoundId(roundId)
    setActiveId(artifacts[0]?.id ?? null)
    setMountedIds(new Set(artifacts[0] ? [artifacts[0].id] : []))
  }

  // Derived, never stored: an id that no longer appears in `artifacts` (a
  // defensive case, not one a monotonically-revealing round should ever
  // produce) falls back to the first artifact rather than an out-of-bounds
  // index, without this component having to remember it was ever wrong.
  const rawIndex = artifacts.findIndex((artifact) => artifact.id === activeId)
  const index = rawIndex === -1 ? 0 : rawIndex
  const current = artifacts[index]

  // The current artifact joins the mounted set the instant it becomes
  // current — synchronously during render, the same "adjust state during
  // render" idiom the round-reset above uses, so the very first paint of a
  // newly-active artifact already includes it rather than a frame of
  // nothing.
  if (current !== undefined && !mountedIds.has(current.id)) {
    setMountedIds(new Set([...mountedIds, current.id]))
  }

  const goTo = (nextIndex: number): void => {
    const clamped = Math.max(0, Math.min(artifacts.length - 1, nextIndex))
    const next = artifacts[clamped]
    if (next !== undefined) setActiveId(next.id)
  }

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>): void => {
    const target = event.target
    if (target instanceof Element && target.closest("[data-scroll-intent]")) {
      touchStart.current = null
      return
    }
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>): void => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
      return
    }
    goTo(index + (dx < 0 ? 1 : -1))
  }

  const handleTouchCancel = (): void => {
    touchStart.current = null
  }

  if (current === undefined) return null

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous artifact"
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
          aria-label="Next artifact"
          disabled={index === artifacts.length - 1}
          onClick={() => goTo(index + 1)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-30 enabled:hover:bg-card/70 enabled:hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* The same fact the dots paint decoratively, said in words for a
          screen reader — `aria-live="polite"` so a press or a swipe is
          announced without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {ariaLabel}: {current.label}, {index + 1} of {artifacts.length}
      </p>

      <div
        className="mt-2 min-w-0 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {artifacts
          .filter((artifact) => mountedIds.has(artifact.id))
          .map((artifact) => (
            <div
              key={artifact.id}
              hidden={artifact.id !== current.id}
              className="min-w-0"
            >
              {artifact.content}
            </div>
          ))}
      </div>
    </div>
  )
}
