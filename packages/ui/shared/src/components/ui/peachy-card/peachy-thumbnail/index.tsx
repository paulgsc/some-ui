import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { cn } from "@shared/lib/utils"

export const PeachyThumbnail = forwardRef(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative w-full rounded-sm bg-white p-4",
        // Custom shadow that mimics the polaroid in the image
        "shadow-[2px_2px_4px_-1px_rgba(0,0,0,2.15),_-1px_-1px_4px_-1px_rgba(0,0,0,0.1)]",
        // Very subtle rotation to match the slight tilt in the reference image
        "-rotate-1",
        className
      )}
      style={{
        // Using OKLCH for the background color to get that slight off-white polaroid look
        backgroundColor: "oklch(0.98 0.005 90)",
      }}
      {...props}
    >
      <div className="relative size-full overflow-hidden">{children}</div>
    </div>
  )
)

PeachyThumbnail.displayName = "PeachyThumbnail"
