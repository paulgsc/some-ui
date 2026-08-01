import type { FC } from "react"
import { Alert, AlertDescription, AlertTitle, Button } from "@some-ui/shared"
import { AlertCircle } from "lucide-react"

type TypingErrorAlertProps = {
  showErrorAlert: boolean
  /**
   * How far the caret has run past its earliest uncorrected mistake — a
   * distance, not a tally. Typing `baf ` for `bar ` is 3 with only one wrong
   * key in it, because the space after the divergence is only accidentally in
   * the right place. The copy below says "keystrokes past", not "mistakes",
   * for exactly that reason.
   */
  consecutiveErrors: number
  onDismiss: () => void
}

export const TypingErrorAlert: FC<TypingErrorAlertProps> = ({
  showErrorAlert,
  consecutiveErrors,
  onDismiss,
}) => {
  return (
    <>
      {showErrorAlert && (
        <Alert
          variant="destructive"
          className="mb-4 flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <div className="flex flex-1 flex-col gap-2">
            <AlertTitle className="leading-tight">
              You’ve drifted off the text
            </AlertTitle>

            <div className="flex items-center justify-between gap-4">
              <AlertDescription className="text-sm leading-relaxed">
                You’re{" "}
                <span className="font-medium">
                  {consecutiveErrors} keystroke
                  {consecutiveErrors === 1 ? "" : "s"} past an uncorrected
                  mistake
                </span>
                . Backspace to it before continuing.
              </AlertDescription>

              <Button
                variant="outline"
                size="sm"
                onClick={onDismiss}
                className="shrink-0"
              >
                Got it
              </Button>
            </div>
          </div>
        </Alert>
      )}{" "}
    </>
  )
}
