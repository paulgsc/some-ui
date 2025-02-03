import type { FC } from "react"
import { Badge } from "@shared/components/ui/badge"
import type { badgeVariants } from "@shared/components/ui/badge"
import { cn } from "@shared/lib/utils"
import type { VariantProps } from "class-variance-authority"

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
