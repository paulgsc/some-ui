import type { FC } from "react"
import { cn } from "some-ui-utils"

type SlideNavigationProps = {
  totalSlides: number
  currentSlide: number
  onSlideChange: (index: number) => void
  progressKey: number
}

export const SlideNavigation: FC<SlideNavigationProps> = ({
  totalSlides,
  currentSlide,
  onSlideChange,
  progressKey,
}) => {
  return (
    <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 transform items-center gap-4">
      {Array.from({ length: totalSlides }, (_, i) => (
        <div
          key={i}
          className={cn(
            "size-3 cursor-pointer rounded-full transition-all duration-300",
            i === currentSlide
              ? "scale-110 transform bg-teal-400"
              : "bg-gray-500/40 hover:bg-gray-400"
          )}
          onClick={() => onSlideChange(i)}
        />
      ))}

      <div className="relative mx-5 h-1 w-48 overflow-hidden rounded-full bg-gray-500/20">
        <div
          key={progressKey}
          className="animate-progress h-full rounded-full bg-gradient-to-r from-teal-400 to-blue-500"
        />
      </div>
    </div>
  )
}
