/**
 * The quiet file pick that opens what a session sent (Studio's scenes or
 * version, an idea's reply): a label, a hint that a problem replaces, and
 * the picked file handed on. The same file picked again is a new pick.
 */
import type { JSX } from "react"
import { useId } from "react"
import { cn } from "@some-ui/core-utils"
import { FolderOpen } from "lucide-react"

export const FilePick = ({
  label,
  hint: told,
  problem = null,
  disabled = false,
  onPick,
}: {
  label: string
  hint: string
  /** What is wrong with the last pick, in its place; null when nothing is. */
  problem?: string | null
  disabled?: boolean
  onPick: (file: File) => void
}): JSX.Element => {
  const hint = useId()
  return (
    <label className="bg-background border-border/60 focus-within:ring-ring relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 focus-within:ring-2">
      <FolderOpen className="text-primary size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span
          id={hint}
          aria-live="polite"
          className={cn(
            "block text-xs",
            problem === null ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {problem ?? told}
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
  )
}
