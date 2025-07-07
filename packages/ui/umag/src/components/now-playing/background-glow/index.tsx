import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { cn } from "some-ui-utils"

export const BackgroundGlow = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        className,
        "absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 blur-xl"
      )}
      {...props}
    />
  )
})

BackgroundGlow.displayName = "BackgroundGlow"
