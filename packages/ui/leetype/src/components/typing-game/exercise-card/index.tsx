import type { FC, RefObject } from "react"
import { useId } from "react"
import { PromptPanel } from "@leetype/components/typing-game/prompt-panel"
import { StepRail } from "@leetype/components/typing-game/step-rail"
import { TypingViewport } from "@leetype/components/typing-game/typing-viewport"
import { useKeystrokeCapture } from "@leetype/hooks/leetype/use-keystroke-capture"
import type { Step } from "@leetype/types/exercise"
import { languageOf, promptBlocksOf } from "@leetype/types/exercise"
import type { GameState, Rejection, TextGradient } from "@leetype/types/leetype"
import { Eye } from "lucide-react"
import { cn } from "some-ui-utils"

/**
 * The one message a refused keystroke is worth interrupting for. The other
 * rejections are either self-evident (nothing left to type) or already
 * carried by the error alert, so they stay silent rather than nagging.
 */
const REJECTION_HINT: Partial<Record<Rejection, string>> = {
  extraSpace: "Indentation is automatic — just keep typing the code",
}

type ExerciseCardProps = {
  step: Step
  /** 0-based index of the step in flight. */
  index: number
  total: number
  /** Non-zero once the gate has held on this step. */
  attempt: number
  // ── Engine projections for this step's typing block ──────────────────
  /**
   * The engine's rendered text for this step — `Layout.displaySource`, not
   * `typingBlockOf(step)?.source`. The two differ once the source carries a
   * context span (its `‹…›` delimiters are stripped before this is built),
   * and `roles`/`slotOfDisplay`/`slotStatus`/`visibility` below are indexed
   * against the rendered form, not the raw authored one.
   */
  displaySource: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
  cursorDisplay: number
  /**
   * Whether a manual-reveal toggle currently has the auto-hide loop frozen
   * open, and how much of that freeze is left (`1` just after toggling,
   * decaying to `0`). Drives the toggle's visual ergonomic effect below —
   * never `CodeDisplay`, which owns no masking-state affordance of its own.
   */
  manualRevealActive: boolean
  manualRevealFraction: number
  rejection: Rejection | null
  gameState: GameState
  onKey: (key: string) => void
  onBackspace: () => void
  onToggleReveal: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  textGradient?: TextGradient
  className?: string
}

/**
 * The card: a fixed prompt over a scrolling viewport, with the step rail
 * beneath.
 *
 * ```text
 * ┌──────────────────────────────┐
 * │ Insert a default value into  │  ← PromptPanel: fixed, ~20%, never scrolls
 * │ a HashMap only if absent.    │
 * ├──────────────────────────────┤
 * │ let ___ = map.___(key)       │  ← TypingViewport: owns the scroll, ~80%
 * │     .___(Vec::new);█         │
 * └──────────────────────────────┘
 *         ●●●●○○○○○○○○
 * ```
 *
 * This component composes and does nothing else. It does not know what a
 * caret is and it does not know what a competency is — the projections
 * arrive as props and are handed on, and the step arrives as data.
 *
 * The 20/80 split is not cosmetic: it is the cognitive-load allocation
 * stated as layout, and it holds at every viewport because it is expressed
 * as flex basis on a fixed child plus `min-h-0 flex-1` on the flexible one,
 * rather than as a percentage that collapses on short windows.
 *
 * # Why the textarea lives here and not one level down
 *
 * It is the keystroke-capture element, and it must survive a step advance
 * with focus intact — the player's hands do not leave the keys, so a step
 * boundary that dropped focus would silently stop accepting input. Mounting
 * it above everything that changes per step (and never keying it by step) is
 * what makes that true by construction rather than by a refocus effect
 * racing the render.
 */
export const ExerciseCard: FC<ExerciseCardProps> = ({
  step,
  index,
  total,
  attempt,
  displaySource,
  roles,
  slotOfDisplay,
  slotStatus,
  visibility,
  cursorDisplay,
  manualRevealActive,
  manualRevealFraction,
  rejection,
  gameState,
  onKey,
  onBackspace,
  onToggleReveal,
  inputRef,
  textGradient,
  className,
}) => {
  const inputId = useId()
  const canType = gameState === "playing"
  const hint = rejection ? REJECTION_HINT[rejection] : undefined

  useKeystrokeCapture(inputRef, {
    onKey,
    onBackspace,
    onToggleReveal,
    enabled: canType,
  })

  return (
    // A <label> associated with the hidden textarea below: clicking anywhere
    // on the card natively focuses the input (and is a no-op while the
    // textarea is disabled), so the whole card acts as the typing target
    // without a manual click handler.
    <label
      htmlFor={inputId}
      className={cn("flex h-full min-h-0 flex-col gap-3", className)}
    >
      <textarea
        id={inputId}
        ref={inputRef}
        value=""
        readOnly
        disabled={!canType}
        aria-label="Typing input"
        className="absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />

      <PromptPanel
        goal={step.goal}
        blocks={promptBlocksOf(step)}
        position={index + 1}
        total={total}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <TypingViewport
          displayCode={displaySource}
          language={languageOf(step)}
          roles={roles}
          slotOfDisplay={slotOfDisplay}
          slotStatus={slotStatus}
          visibility={visibility}
          cursorDisplay={cursorDisplay}
          textGradient={textGradient}
        />

        {canType && hint && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
          >
            <span className="rounded-full border border-border bg-background/90 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              {hint}
            </span>
          </div>
        )}

        {canType && manualRevealActive && (
          // The manual-reveal toggle's whole visual footprint: a small,
          // out-of-the-way pill, not a banner. It fades as the freeze runs
          // down (`manualRevealFraction`) instead of showing a countdown
          // number — informative without being another thing to read, which
          // is the same "non-mentally-load-bearing" bar the reveal loop
          // itself is held to.
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-opacity duration-500"
            style={{ opacity: 0.35 + manualRevealFraction * 0.65 }}
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            <span>Revealed — Tab to hide</span>
          </div>
        )}
      </div>

      <StepRail total={total} current={index} attempt={attempt} />
    </label>
  )
}
