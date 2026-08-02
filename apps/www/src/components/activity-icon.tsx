import type { JSX } from "react"
import type { ActivityIconKey } from "@some-ui/activity-catalog"
import type { LucideIcon } from "lucide-react"
import { BookOpen, Hexagon, Keyboard, Mic } from "lucide-react"

const ICONS: Record<ActivityIconKey, LucideIcon> = {
  hexagon: Hexagon,
  "book-open": BookOpen,
  mic: Mic,
  keyboard: Keyboard,
}

type ActivityIconProps = {
  icon: ActivityIconKey
  className?: string
}

export const ActivityIcon = ({
  icon,
  className,
}: ActivityIconProps): JSX.Element => {
  const Icon = ICONS[icon]
  return <Icon className={className} />
}
