import type { JSX, ReactNode } from "react"
import { cn } from "some-ui-utils"

type BentoWireframeProps = {
  top?: ReactNode // 3
  bar?: ReactNode // 2
  main?: ReactNode // 1
  asideTop?: ReactNode // 4
  asideMid?: ReactNode // 5
  asideBottom?: ReactNode // 6
  className?: string
}

/**
 * BentoWireframe
 * - Fills and scales within its parent while preserving the wireframe proportions.
 * - Uses CSS Grid with fractional tracks so areas keep their relative sizes on any screen.
 * - Replace placeholders by passing React nodes to the corresponding props.
 *
 * Usage:
 * <div className="h-[70vh]"><BentoWireframe /></div>
 */
export const BentoWireframe = ({
  top,
  bar,
  main,
  asideTop,
  asideBottom,
  className,
}: BentoWireframeProps): JSX.Element => {
  // Scalable sizing tokens that respond to viewport and container changes
  const pad = "clamp(10px, 1.4vmin, 22px)"
  const gap = "clamp(8px, 1.2vmin, 18px)"
  const radiusOuter = "clamp(16px, 2vmin, 28px)"
  const radiusInner = "clamp(12px, 1.6vmin, 22px)"

  return (
    <div
      className={cn(
        "absolute inset-0 grid size-full min-h-0 min-w-0",
        "rounded-3xl shadow-sm",
        "grid-cols-[3fr_1fr]",
        className
      )}
      style={{
        padding: pad,
        borderRadius: radiusOuter,
        gap,
        gridTemplateRows: "0.22fr 0.24fr 1fr",
      }}
      aria-label="Bento wireframe container"
    >
      {/* 3 - Top, centered long pill */}
      <div className="relative col-start-1 col-end-4 flex-1">
        {top ?? <Placeholder label="3" radius={radiusInner} />}
      </div>

      {/* 2 - Left pill below the top header */}
      <div className="relative col-start-1 col-end-3 row-start-2 flex-1 p-1.5">
        {bar ?? <Placeholder label="2" radius={radiusInner} />}
      </div>

      {/* Right column (4,5,6) */}
      <div className="col-start-3 row-start-2 row-end-4 flex-1 space-y-2.5 px-1.5">
        <div
          className={cn("grid size-full grid-rows-[.3fr_1fr] space-y-2")}
          aria-label="Right column group"
        >
          <div className="relative">
            {" "}
            {asideTop ?? <Placeholder label="4" radius={radiusInner} />}
          </div>
          <div className="relative">
            {" "}
            {asideBottom ?? (
              <Placeholder label="6" radius={radiusInner} emphasis />
            )}
          </div>
        </div>
      </div>

      {/* 1 - Main left area */}
      <div className="relative col-start-1 col-end-3 row-start-3 flex-1">
        {main ?? <Placeholder label="1" radius={radiusInner} emphasis />}
      </div>
    </div>
  )
}

const Placeholder = ({
  label,
  radius,
  emphasis = false,
}: {
  label: string
  radius: string
  emphasis?: boolean
}): JSX.Element => {
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center",
        "text-xs text-zinc-600 sm:text-sm",
        "ring-1 ring-zinc-400/70",
        emphasis ? "bg-amber-50" : "bg-zinc-100"
      )}
      style={{ borderRadius: radius }}
      aria-label={`Placeholder ${label}`}
    >
      {label}
    </div>
  )
}
