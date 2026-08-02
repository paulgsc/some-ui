import type { JSX } from "react"
import { Alert, AlertDescription } from "@some-ui/shared"
import { AlertCircle } from "lucide-react"

type ErrorDisplayProps = {
  error: string
}

export const ErrorDisplay = ({
  error,
}: ErrorDisplayProps): JSX.Element | null => {
  if (!error) return null

  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}
