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

type Particle = {
  id: string
  left: string
  top: string
  animationDelay: string
}

const PARTICLE_COUNT = 25

const createParticles = (): Array<Particle> =>
  Array.from({ length: PARTICLE_COUNT }, () => ({
    id: crypto.randomUUID(),
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 90}s`,
  }))

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

  // Generated exactly once for this component instance.
  const [particles] = useState(createParticles)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true)
    }, 50)

    return (): void => {
      clearTimeout(timer)
    }
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
        "relative inline-flex w-full items-center justify-center p-8",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="particle absolute size-1 rounded-full"
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.animationDelay,
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
        <div className="scan-lines pointer-events-none absolute inset-0" />

        <div className="glitch-top pointer-events-none absolute inset-0 flex items-center justify-center">
          <h1 className="text-balance text-center text-5xl font-bold leading-tight tracking-wider opacity-30 md:text-6xl lg:text-7xl">
            {displayText}
          </h1>
        </div>

        <div className="glitch-bottom pointer-events-none absolute inset-0 flex items-center justify-center">
          <h1 className="text-balance text-center text-5xl font-bold leading-tight tracking-wider opacity-30 md:text-6xl lg:text-7xl">
            {displayText}
          </h1>
        </div>

        <h1
          className={cn(
            "text-balance text-center text-5xl font-bold leading-tight tracking-wider transition-opacity duration-1000 md:text-6xl lg:text-7xl",
            isMounted ? "opacity-100" : "opacity-0"
          )}
        >
          {displayText}
        </h1>

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
