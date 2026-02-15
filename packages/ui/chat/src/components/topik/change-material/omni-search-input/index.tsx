import { useCallback, useEffect, useRef } from "react"
import type { TopikMetadata } from "@chat/lib/topik"
import { Search } from "lucide-react"
import { Input } from "some-ui-shared"
import { cn } from "some-ui-utils"

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
}: OmniSearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-highlight first item when list changes
  useEffect(() => {
    if (items.length > 0 && !highlightedKey) {
      onHighlight(items[0].key)
    }
  }, [items, highlightedKey, onHighlight])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (items.length === 0) return

      const currentIndex = items.findIndex((i) => i.key === highlightedKey)

      if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0
        onHighlight(items[next].key)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1
        onHighlight(items[prev].key)
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (highlightedKey) {
          onSelect(highlightedKey)
        }
      }
    },
    [items, highlightedKey, onHighlight, onSelect]
  )

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
