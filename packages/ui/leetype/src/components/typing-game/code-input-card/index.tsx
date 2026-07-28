import type { ChangeEvent, FC, RefObject } from "react"
import { useId } from "react"
import { CodeDisplay } from "@leetype/components/typing-game/code-display"
import { ErrorCodeState } from "@leetype/components/typing-game/error-code-state"
import { LoadingCodeState } from "@leetype/components/typing-game/loading-code-state"
import type { ChunkedCodeState } from "@leetype/hooks/leetype/use-chunked-code"
import type {
  CanonicalUnit,
  DisplayMode,
  GameState,
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
  targetUnits: Array<CanonicalUnit>
  userUnits: Array<CanonicalUnit>
  cursorDisplayIndex: number
  displayMode: DisplayMode
  adaptiveMessage?: string
  textGradient?: TextGradient
  gameState: GameState
  userInput: string
  onInputChange: (value: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  elapsedTime: number
  accuracy: number
  progress: number
  className?: string
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * The single code + input surface: target code is always visible (subject to
 * displayMode masking), and a visually hidden textarea anchored behind it
 * captures keystrokes so the whole card acts as the typing target — no
 * separate input pane.
 */
export const CodeInputCard: FC<CodeInputCardProps> = ({
  status,
  loadError,
  path,
  onRetryLoad,
  displayCode,
  language,
  targetUnits,
  userUnits,
  cursorDisplayIndex,
  displayMode,
  adaptiveMessage,
  textGradient,
  gameState,
  userInput,
  onInputChange,
  inputRef,
  elapsedTime,
  accuracy,
  progress,
  className,
}) => {
  const canType = status === "SUCCESS" && gameState !== "idle"
  const inputId = useId()

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    onInputChange(e.target.value)
  }

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
        value={userInput}
        onChange={handleChange}
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
            targetUnits={targetUnits}
            cursorDisplayIndex={cursorDisplayIndex}
            userUnits={userUnits}
            displayMode={displayMode}
            adaptiveMessage={adaptiveMessage}
            textGradient={textGradient}
          />
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
