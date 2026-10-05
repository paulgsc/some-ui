import type { FC, RefObject } from "react"
import { useId, useMemo } from "react"
import { PromptPanel } from "@leetype/components/typing-game/prompt-panel"
import { StepRail } from "@leetype/components/typing-game/step-rail"
import { TypingViewport } from "@leetype/components/typing-game/typing-viewport"
import { useKeystrokeCapture } from "@leetype/hooks/leetype/use-keystroke-capture"
import type { Step } from "@leetype/types/exercise"
import {
  languageOf,
  promptBlocksOf,
  renderedDiffLineKinds,
  typingBlockOf,
} from "@leetype/types/exercise"
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
   * The engine's rendered text (`Layout.displaySource`), not the authored
   * source: `‹…›` delimiters are stripped, and the maps below index this.
   */
  displaySource: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  visibility: Uint8Array
  cursorDisplay: number
  /**
   * Whether manual reveal has the auto-hide loop frozen open, and how much of
   * the freeze is left (`1` → `0`). Drives the pill below, not `CodeDisplay`.
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
 * Composition only: it knows neither carets nor competencies.
 *
 * The 20/80 split is the cognitive-load allocation as layout, expressed as a
 * fixed child plus `min-h-0 flex-1` so it holds on short windows.
 *
 * The keystroke-capture textarea lives here, above everything that changes
 * per step and never keyed by step, so focus survives a step advance by
 * construction.
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
  const diff = typingBlockOf(step)?.diff
  // Memoized on `step`: the session clock re-renders every 250ms, and
  // PromptPanel keys its derived rows on this reference to tell "the prompt
  // changed" from "a tick happened".
  //
  // The React Compiler only runs as a lint healthcheck here (no build
  // plugin). It bails on this component because of the `hunk` conditional
  // object over the `ReadBlock` union below, unrelated to this memo, so the
  // bail has no runtime effect.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const blocks = useMemo(() => promptBlocksOf(step), [step])
  const hunk = diff && {
    path: diff.path,
    oldStart: diff.oldStart,
    newStart: diff.newStart,
    lineKinds: renderedDiffLineKinds(diff),
  }

  useKeystrokeCapture(inputRef, {
    onKey,
    onBackspace,
    onToggleReveal,
    enabled: canType,
  })

  return (
    // A <label> for the hidden textarea: clicking anywhere focuses it.
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
        blocks={blocks}
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
          hunk={hunk}
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
          // A small pill that fades as the freeze runs down, rather than a
          // countdown to read.
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
