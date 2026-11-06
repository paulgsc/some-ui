/**
 * The quiet file pick that opens what a session sent (Studio's scenes or
 * version, an idea's reply): a label, a hint, and the picked file handed on.
 * The same file picked again is a new pick. What is wrong with a pick is
 * said over the screen, so the pick holds its size (HS1).
 */
import type { JSX } from "react"
import { useId } from "react"
import { Notice } from "@some-ui/shared"
import { FolderOpen } from "lucide-react"

export const FilePick = ({
  label,
  hint: told,
  problem = null,
  onDismiss,
  disabled = false,
  onPick,
}: {
  label: string
  hint: string
  /** What is wrong with the last pick; null when nothing is. */
  problem?: string | null
  /** Closes the problem said, where nothing else takes it away. */
  onDismiss?: () => void
  disabled?: boolean
  onPick: (file: File) => void
}): JSX.Element => {
  const hint = useId()
  return (
    <>
      <label className="bg-background border-border/60 focus-within:ring-ring relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 focus-within:ring-2">
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
      {problem !== null && (
        <Notice role="alert" tone="danger" onDismiss={onDismiss}>
          {problem}
        </Notice>
      )}
    </>
  )
}
