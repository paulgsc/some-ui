/**
 * How a template setting changed in Studio is sent (SFEED11, SFEED14): a
 * link that opens it as a new GitHub issue, once something has changed, a
 * way to start over, and what sending does. Each control builds its issue
 * (`lib/caption-look`, `lib/mark-theme`).
 */
import type { JSX } from "react"
import { Button } from "@some-ui/shared"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

const WORDS = STUDIO_INDEX_WORDS.templates.issue

/** `href` is the issue to open, or `null` while nothing has changed. */
export const SendIssue = ({
  href,
  sendLine,
  onReset,
}: {
  href: string | null
  sendLine: string
  onReset: () => void
}): JSX.Element => (
  <>
    <div className="flex flex-wrap items-center gap-2">
      {href === null ? (
        <span className="text-muted-foreground text-sm">{WORDS.unchanged}</span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="bg-brand text-brand-foreground rounded-xl px-4 py-2 text-sm font-bold"
        >
          {WORDS.send}
        </a>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={href === null}
        onClick={onReset}
      >
        {WORDS.reset}
      </Button>
    </div>
    {href !== null && (
      <p className="text-muted-foreground text-xs">{sendLine}</p>
    )}
  </>
)
