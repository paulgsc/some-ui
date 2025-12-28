import type { FC } from "react"
import { Loader2 } from "lucide-react"

type LoadingCodeStateProps = {
  attempt: number
}

export const LoadingCodeState: FC<LoadingCodeStateProps> = ({ attempt }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/20">
      <div className="relative">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <div className="absolute inset-0 h-12 w-12 rounded-full bg-primary/10 animate-pulse" />
      </div>

      <div className="mt-6 text-center space-y-2">
        <h3 className="text-lg font-semibold text-foreground">
          Loading Code Sample
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {attempt > 1
            ? `Retrying... (Attempt ${attempt})`
            : "Fetching and formatting your code sample"}
        </p>
      </div>

      <div className="mt-6 flex gap-2">
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
      </div>
    </div>
  )
}
