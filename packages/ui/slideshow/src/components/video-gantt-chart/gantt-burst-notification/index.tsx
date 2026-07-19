import { FramerToast } from "@slideshow/components/video-gantt-chart/framer-toast"
import { useToastBurst } from "@slideshow/hooks/use-toast-burst"
import { assertNever } from "@slideshow/utils/error"
import { AnimatePresence } from "framer-motion"
import { cn } from "some-ui-utils"

type ToastPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right"

type Notification = {
  id: number
  title: string
  description: string
}

type ToastContainerProps = {
  notifications: Array<Notification>
  position?: ToastPosition
  isPlaying: boolean
  className?: string
}

export const GanttToast = ({
  notifications,
  isPlaying,
  className,
  position = "top-right",
}: ToastContainerProps): React.JSX.Element => {
  const activeToasts = useToastBurst(notifications, isPlaying)

  return (
    <div
      className={cn(
        "fixed z-[100] size-fit max-w-sm space-y-1.5 overflow-clip",
        getPosition(position),
        className
      )}
    >
      <AnimatePresence>
        {activeToasts.map((toast) => (
          <FramerToast key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
function getPosition(position: ToastPosition): string {
  switch (position) {
    case "top-left": {
      return "top-4 left-4"
    }
    case "top-right": {
      return "top-4 right-4"
    }
    case "bottom-left": {
      return "bottom-4 left-4"
    }
    case "bottom-right": {
      return "bottom-4 right-4"
    }
    default: {
      return assertNever(position)
    }
  }
}
