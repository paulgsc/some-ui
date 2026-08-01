import type { FC, JSX } from "react"
import { AlertCircle, FileQuestion, RefreshCw } from "lucide-react"
import { Button } from "@some-ui/shared"

type ErrorCodeStateProps = {
  error: Error | null
  path: string
  onRetry?: () => void
}

export const ErrorCodeState: FC<ErrorCodeStateProps> = ({
  error,
  path,
  onRetry,
}): JSX.Element => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 bg-destructive/5 rounded-lg border-2 border-destructive/20">
      <div className="relative">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <FileQuestion className="h-5 w-5 text-destructive/60 absolute -bottom-1 -right-1" />
      </div>

      <div className="mt-6 text-center space-y-3 max-w-md">
        <h3 className="text-lg font-semibold text-foreground">
          Failed to Load Code Sample
        </h3>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Unable to load the code file from:
          </p>
          <code className="block text-xs bg-muted px-3 py-2 rounded font-mono text-foreground break-all">
            {path}
          </code>
        </div>

        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            View Error Details
          </summary>
          <pre
            data-scroll-intent="long-form"
            className={
              // scroll-intent: long-form — a stack trace is as long as it is,
              // and truncating one hides the line that explains the failure.
              // Bounded to max-h-32 so it cannot take over the panel.
              "mt-2 text-xs bg-muted/50 p-3 rounded overflow-auto max-h-32 text-destructive border border-destructive/20"
            }
          >
            {error?.message}
          </pre>
        </details>
      </div>

      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="mt-6 gap-2"
          size="sm"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Loading
        </Button>
      )}
    </div>
  )
}
