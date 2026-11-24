import type { ReactNode } from "react"

import { cn } from "../../../lib/utils"

/**
 * What stands in for something read from elsewhere while it reads (home,
 * GitHub, the phone's own store): a quiet line, marked busy, so a screen
 * reader hears the region is still loading and Snips Capture waits for it
 * before taking the screen's picture (#3491). The words are the caller's.
 */
const Reading = ({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}): React.JSX.Element => (
  <p
    role="status"
    aria-busy="true"
    className={cn("text-muted-foreground text-sm", className)}
  >
    {children}
  </p>
)

export { Reading }
