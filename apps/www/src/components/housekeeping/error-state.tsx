import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { Link, type ErrorComponentProps } from "@tanstack/react-router"
import { Home, RotateCcw, TriangleAlert } from "lucide-react"

/**
 * Route error boundary. Wired as the router's `defaultErrorComponent`, so a
 * throw during render/loading is caught here instead of blanking the app.
 * `reset` retries the failed route without a full page reload.
 */
export const ErrorState = ({
  error,
  reset,
}: ErrorComponentProps): JSX.Element => {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred."

  return (
    <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <TriangleAlert className="text-destructive size-12" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground max-w-md text-sm break-words">
          {message}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="mr-2 size-4" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link to="/">
            <Home className="mr-2 size-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </main>
  )
}
