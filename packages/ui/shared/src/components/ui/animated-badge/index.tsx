import type { FC } from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils"
import { Badge } from "../badge"
import type { badgeVariants } from "../badge"

type AnimatedBadgeProps = {
  text?: string
  className?: string
} & VariantProps<typeof badgeVariants>

export const AnimatedBadge: FC<AnimatedBadgeProps> = ({
  text = "Currenlty Working On",
  className,
  variant,
}) => {
  return (
    <Badge
      variant={variant}
      className={cn(
        "shrink-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-xs tracking-tight shadow-lg",
        className
      )}
    >
      <span className="">🚀</span>
      {text}
      <span className="ml-2 inline-block animate-sparkle">✨</span>
    </Badge>
  )
}
