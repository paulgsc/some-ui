import type { JSX, ReactNode } from "react"
import { Button } from "@some-ui/shared"

/**
 * Toggle chips: each pressed or not, in the order given. `label` names the
 * group, and shows before the chips when `labelled`.
 */
export const Chips = <T extends string>({
  label,
  labelled = false,
  options,
  pressed,
  onToggle,
  disabled,
}: {
  label: string
  labelled?: boolean
  options: ReadonlyArray<readonly [T, ReactNode]>
  pressed: (value: T) => boolean
  onToggle: (value: T) => void
  disabled?: (value: T) => boolean
}): JSX.Element => {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
    >
      {labelled && (
        <span aria-hidden className="text-muted-foreground text-xs">
          {label}
        </span>
      )}
      {options.map(([value, text]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          className="gap-1.5 rounded-full"
          variant={pressed(value) ? "default" : "outline"}
          aria-pressed={pressed(value)}
          disabled={disabled?.(value)}
          onClick={() => onToggle(value)}
        >
          {text}
        </Button>
      ))}
    </div>
  )
}
