import type { ChangeEvent, FC } from "react"
import { useEffect, useState } from "react"
import { Input } from "some-ui-shared"
import { cn, useLocalStorage } from "some-ui-utils"

type HeadlineTheme = "peach-blossom" | "strawberry-moon" | "dark-gold"

type HeadlineProps = {
  initialText?: string
  className?: string
  storageKey?: string
  theme?: HeadlineTheme
}

export const Headline: FC<HeadlineProps> = ({
  initialText = "Your headline here",
  storageKey = "headline",
  theme = "peach-blossom",
  className,
}) => {
  const { value: headline, setValue: updateHeadline } = useLocalStorage(
    storageKey,
    initialText
  )
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    updateHeadline(e.target.value)
  }

  const displayText = headline || initialText

  return (
    <div
      className={cn(
        "headline",
        `headline--${theme}`,
        "relative w-full inline-flex items-center justify-center p-8",
        className
      )}
    >
      {/* Depth noise - static atmospheric specks */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="particle absolute size-1 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 90}s`,
            }}
          />
        ))}
      </div>

      <div
        className={cn(
          "group relative flex min-h-[400px] items-center justify-center px-8 py-12",
          "ambient-drift headline-mount",
          !isMounted && "opacity-0"
        )}
      >
        {/* CRT atmosphere */}
        <div className="scan-lines pointer-events-none absolute inset-0" />

        {/* Rare glitch overlays - signal interference */}
        <div className="glitch-top pointer-events-none absolute inset-0 flex items-center justify-center">
          <h1 className="text-balance text-center text-5xl font-bold leading-tight tracking-wider md:text-6xl lg:text-7xl opacity-30">
            {displayText}
          </h1>
        </div>

        <div className="glitch-bottom pointer-events-none absolute inset-0 flex items-center justify-center">
          <h1 className="text-balance text-center text-5xl font-bold leading-tight tracking-wider md:text-6xl lg:text-7xl opacity-30">
            {displayText}
          </h1>
        </div>

        {/* Main text - single mass with optical bloom */}
        <h1
          className={cn(
            "text-balance text-center text-5xl font-bold leading-tight tracking-wider md:text-6xl lg:text-7xl",
            "transition-opacity duration-1000",
            isMounted ? "opacity-100" : "opacity-0"
          )}
        >
          {displayText}
        </h1>

        {/* Invisible overlay input */}
        <Input
          type="text"
          value={headline}
          onChange={handleInputChange}
          placeholder={initialText}
          className={cn(
            "absolute inset-0 size-full cursor-text border-none bg-transparent",
            "text-center text-5xl font-bold leading-tight tracking-wider text-transparent",
            "md:text-6xl lg:text-7xl",
            "caret-[oklch(var(--text-glow))] placeholder:text-transparent",
            "focus-visible:ring-1 focus-visible:ring-[oklch(var(--text-glow)/0.3)]"
          )}
          aria-label="Edit headline"
        />

        {/* Edit indicator */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-4 right-4 text-xs opacity-0 transition-opacity",
            "group-hover:opacity-60",
            "text-[oklch(var(--text-glow)/0.6)]"
          )}
        >
          {">"} Click to edit_
        </div>
      </div>
    </div>
  )
}

