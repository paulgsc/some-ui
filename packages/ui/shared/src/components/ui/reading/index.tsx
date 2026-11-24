import type { ReactNode } from "react"

import { cn } from "../../../lib/utils"

/**
 * What stands in for something read from elsewhere while it reads (home,
 * GitHub, the phone's own store): a quiet line of the screen's own, marked
 * `aria-busy`, which Snips Capture waits on before taking the screen's
 * picture (#3491) and assistive tech may read as still loading. Not a
 * status message: what was just done goes on the notice plane (HS3). The
 * words are the caller's.
 */
const Reading = ({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}): React.JSX.Element => (
  <p
    aria-busy="true"
    className={cn("text-muted-foreground text-sm", className)}
  >
    {children}
  </p>
)

export { Reading }
