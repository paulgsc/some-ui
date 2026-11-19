/**
 * The file pick that opens what a session sent (Studio's scenes or
 * version, an idea's reply): a card that opens the file picker (`CardLink`,
 * #3234), its label and hint, and the picked file handed on.
 * The same file picked again is a new pick.
 */
import type { JSX } from "react"
import { useId } from "react"
import { CardLink, Notice } from "@some-ui/shared"
import { FolderOpen } from "lucide-react"

export const FilePick = ({
  label,
  hint: told,
  problem = null,
  disabled = false,
  onPick,
  onDismiss,
}: {
  label: string
  hint: string
  /** What is wrong with the last pick; null when nothing is. */
  problem?: string | null
  disabled?: boolean
  onPick: (file: File) => void
  /**
   * Closes the problem in the state that holds it, so the same problem from
   * the next pick is said again.
   */
  onDismiss?: () => void
}): JSX.Element => {
  const hint = useId()
  return (
    <>
      <CardLink
        asChild
        className="focus-within:ring-ring relative cursor-pointer focus-within:ring-2"
      >
        <label>
          <FolderOpen
            className="text-primary size-5 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{label}</span>
            <span id={hint} className="text-muted-foreground block text-xs">
              {told}
            </span>
          </span>
          <input
            type="file"
            accept=".json,application/json"
            aria-describedby={hint}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) onPick(file)
            }}
          />
        </label>
      </CardLink>
      {problem !== null && (
        <Notice
          key={problem}
          tone="danger"
          dismissible={onDismiss === undefined}
          onDismiss={onDismiss}
        >
          {problem}
        </Notice>
      )}
    </>
  )
}
