import type { FC, RefObject } from "react"
import { useId } from "react"
import { CodeDisplay } from "@leetype/components/typing-game/code-display"
import { ErrorCodeState } from "@leetype/components/typing-game/error-code-state"
import { LoadingCodeState } from "@leetype/components/typing-game/loading-code-state"
import type { ChunkedCodeState } from "@leetype/hooks/leetype/use-chunked-code"
import { useKeystrokeCapture } from "@leetype/hooks/leetype/use-keystroke-capture"
import type {
  DisplayMode,
  GameState,
  Rejection,
  TextGradient,
} from "@leetype/types/leetype"
import { cn } from "some-ui-utils"

type CodeInputCardProps = {
  status: ChunkedCodeState["status"]
  loadError: Error | null
  path: string
  onRetryLoad: () => void
  displayCode: string
  language: string
  roles: Uint8Array
  slotOfDisplay: Int32Array
  slotStatus: Uint8Array
  cursorDisplay: number
  displayMode: DisplayMode
  adaptiveMessage?: string
  textGradient?: TextGradient
  gameState: GameState
  onKey: (key: string) => void
  onBackspace: () => void
  /** Why the last keystroke was refused, if it was. */
  rejection: Rejection | null
  inputRef: RefObject<HTMLTextAreaElement | null>
  elapsedTime: number
  accuracy: number
  progress: number
  className?: string
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * The one message a refused keystroke is worth interrupting for. The other
 * rejections are either self-evident (nothing left to type) or already
 * carried by the error alert, so they stay silent rather than nagging.
 */
const REJECTION_HINT: Partial<Record<Rejection, string>> = {
  extraSpace: "Indentation is automatic — just keep typing the code",
}

/**
 * The single code + input surface: target code is always visible (subject to
 * displayMode masking), and a visually hidden textarea anchored behind it
 * captures keystrokes so the whole card acts as the typing target — no
 * separate input pane.
 *
 * The textarea holds no text of its own. Under the overlaid layout there is
 * nothing for it to mirror: the engine owns the caret, and layout
 * whitespace is skipped rather than typed, so a text buffer and the
 * rendered source would disagree the moment the player crossed an indent.
 * `useKeystrokeCapture` forwards discrete keystrokes instead.
 */
export const CodeInputCard: FC<CodeInputCardProps> = ({
  status,
  loadError,
  path,
  onRetryLoad,
  displayCode,
  language,
  roles,
  slotOfDisplay,
  slotStatus,
  cursorDisplay,
  displayMode,
  adaptiveMessage,
  textGradient,
  gameState,
  onKey,
  onBackspace,
  rejection,
  inputRef,
  elapsedTime,
  accuracy,
  progress,
  className,
}) => {
  const canType = status === "SUCCESS" && gameState === "playing"
  const inputId = useId()
  const hint = rejection ? REJECTION_HINT[rejection] : undefined

  useKeystrokeCapture(inputRef, {
    onKey,
    onBackspace,
    enabled: canType,
  })

  return (
    // A <label> associated with the hidden textarea below: clicking anywhere
    // on the card natively focuses the input (and is a no-op while the
    // textarea is disabled), so the whole card acts as the typing target
    // without a manual click handler.
    <label
      htmlFor={inputId}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
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

      <div className="relative min-h-0 flex-1 p-2">
        {status === "LOADING" || status === "IDLE" ? (
          <LoadingCodeState attempt={status === "LOADING" ? 1 : 0} />
        ) : status === "ERROR" ? (
          <ErrorCodeState error={loadError} path={path} onRetry={onRetryLoad} />
        ) : (
          <CodeDisplay
            className="h-full"
            displayCode={displayCode}
            language={language}
            roles={roles}
            slotOfDisplay={slotOfDisplay}
            slotStatus={slotStatus}
            cursorDisplay={cursorDisplay}
            displayMode={displayMode}
            adaptiveMessage={adaptiveMessage}
            textGradient={textGradient}
          />
        )}

        {gameState === "playing" && hint && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
          >
            <span className="rounded-full border border-border bg-background/90 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              {hint}
            </span>
          </div>
        )}

        {gameState === "idle" && status === "SUCCESS" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <span className="rounded-full border border-border bg-background/90 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              Press Start below to begin
            </span>
          </div>
        )}

        {gameState === "finished" && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-primary bg-primary/10 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-primary">
              Completed in {formatTime(elapsedTime)} with {accuracy.toFixed(1)}%
              accuracy!
            </p>
          </div>
        )}

        {gameState === "timeout" && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-destructive">
              Time&apos;s up! You typed {progress.toFixed(0)}% of the code.
            </p>
          </div>
        )}
      </div>
    </label>
  )
}
