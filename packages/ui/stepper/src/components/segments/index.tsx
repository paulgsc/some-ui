import type { CSSProperties, HTMLAttributes, LiHTMLAttributes } from "react"
import { forwardRef } from "react"
import { Button } from "some-ui-shared"
import { cn } from "some-ui-utils"

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>

type SegmentProps = {
  segmentWidth?: number
} & LiHTMLAttributes<HTMLLIElement>

export const Segment = forwardRef<HTMLLIElement, SegmentProps>(
  ({ children, className, segmentWidth = 100, ...props }, ref) => {
    const style: CSSVarStyle = { "--segment-width": `${segmentWidth}%` }
    return (
      <li
        ref={ref}
        style={style}
        className={cn(
          "relative h-full list-none first:rounded-l-md last:rounded-r-md",
          "after:absolute after:end-0 after:h-full after:w-[2%]",
          "after:bg-white last:after:hidden",
          "after:z-50",
          "w-[var(--segment-width)]",
          className
        )}
        {...props}
      >
        <Button
          variant="ghost"
          className={cn(
            "absolute inset-0 z-40 m-0 h-full cursor-pointer rounded-none p-0"
          )}
        >
          {children}
        </Button>
      </li>
    )
  }
)

Segment.displayName = "Segment"

type SegementsProps = {
  segmentMarkerPosition?: number
} & HTMLAttributes<HTMLUListElement>

export const Segments = forwardRef<HTMLUListElement, SegementsProps>(
  ({ className, segmentMarkerPosition = 0, ...props }, ref) => {
    const style: CSSVarStyle = {
      "--segment-marker-left": `${segmentMarkerPosition}%`,
    }
    return (
      <ul
        ref={ref}
        style={style}
        className={cn(
          "relative flex h-2 w-full bg-slate-950",
          "after:ms-1/2 after:absolute after:bottom-1/2 after:size-4 after:translate-y-1/2",
          "after:rounded-full after:bg-red-500 after:transition-all after:duration-100",
          "after:pointer-events-none after:z-50",
          "after:left-[var(--segment-marker-left)]",
          className
        )}
        {...props}
      />
    )
  }
)

Segments.displayName = "Segments"
