import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type { LucideIcon } from "lucide-react"

/**
 * Optional one-tap answers: a tap picks, a second tap clears. Never a gate,
 * so ignoring them costs nothing.
 */
export function ToggleChips<T extends string>({
  options,
  value,
  onChange,
  icons,
}: {
  options: ReadonlyArray<readonly [T, string]>
  value: string | null | undefined
  onChange: (next: T | null) => void
  icons?: Record<T, LucideIcon>
}): Array<JSX.Element> {
  return options.map(([id, label]) => {
    const Icon: LucideIcon | undefined = icons?.[id]
    return (
      <Button
        key={id}
        type="button"
        size="sm"
        variant={value === id ? "default" : "outline"}
        aria-pressed={value === id}
        className={cn("h-11 gap-2", Icon && "justify-start")}
        onClick={() => onChange(value === id ? null : id)}
      >
        {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
        <span className="min-w-0 truncate">{label}</span>
      </Button>
    )
  })
}
