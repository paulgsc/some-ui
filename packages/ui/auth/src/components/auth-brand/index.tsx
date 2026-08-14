import type { FC } from "react"
import { cn } from "@some-ui/core-utils"

const RING_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -20],
  [17.321, -10],
  [17.321, 10],
  [0, 20],
  [-17.321, 10],
  [-17.321, -10],
]

const CELL = "M9 0 4.5 7.794 -4.5 7.794 -9 0 -4.5 -7.794 4.5 -7.794Z"

export type AuthBrandProps = {
  name?: string
  className?: string
  markClassName?: string
}

/**
 * The Some UI wordmark. Its geometry and honey colours intentionally match
 * `packages/some-styles/brand/favicon.svg` and `apps/www/public/favicon.svg`.
 */
export const AuthBrand: FC<AuthBrandProps> = ({
  name = "Some UI",
  className,
  markClassName,
}) => (
  <div
    className={cn(
      "text-foreground inline-flex items-center gap-2 font-semibold",
      className
    )}
  >
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8", markClassName)}
      aria-hidden="true"
    >
      <g transform="translate(32 32)">
        {RING_OFFSETS.map(([x, y]) => (
          <path
            key={`${x},${y}`}
            d={CELL}
            transform={`translate(${x} ${y})`}
            fill="#f59e0b"
          />
        ))}
        <path d={CELL} fill="#fde68a" />
      </g>
    </svg>
    <span>{name}</span>
  </div>
)
