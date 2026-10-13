import type { JSX } from "react"
import { useCallback, useRef } from "react"
import { cn } from "@some-ui/core-utils"
import { Input } from "@some-ui/shared"
import type { TopikMetadata } from "@topik/lib/topik"
import { Search } from "lucide-react"

type OmniSearchInputProps = {
  value: string
  onChange: (value: string) => void
  items: Array<TopikMetadata>
  onHighlight: (key: string | undefined) => void
  onSelect: (key: string) => void
  highlightedKey?: string
  disabled?: boolean
}

export const OmniSearchInput = ({
  value,
  onChange,
  items,
  onHighlight,
  onSelect,
  highlightedKey,
  disabled = false,
}: OmniSearchInputProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null)

  // A highlight the filter has hidden falls back to the first visible item.
  const activeKey = items.some((i) => i.key === highlightedKey)
    ? highlightedKey
    : items[0]?.key

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (items.length === 0) return

      const currentIndex = items.findIndex((i) => i.key === activeKey)
      const len = items.length

      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextItem = items[(currentIndex + 1) % len]
        if (nextItem) onHighlight(nextItem.key)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prevItem = items[(currentIndex - 1 + len) % len]
        if (prevItem) onHighlight(prevItem.key)
      } else if (e.key === "Enter" && activeKey) {
        e.preventDefault()
        onSelect(activeKey)
      }
    },
    [items, activeKey, onHighlight, onSelect]
  )

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        onKeyDown={handleKeyDown}
        placeholder="Search materials..."
        disabled={disabled}
        className={cn(
          "pl-9 bg-background border-border",
          "placeholder:text-muted-foreground/60"
        )}
      />
      {value && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          {items.length} {items.length === 1 ? "result" : "results"}
        </span>
      )}
    </div>
  )
}
