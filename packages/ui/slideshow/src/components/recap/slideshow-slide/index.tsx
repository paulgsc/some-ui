import type { FC } from "react"
import { TerminalHeader } from "@slideshow/components/recap/terminal-header"
import { cn } from "some-ui-utils"

type SlideshowSlideProps = {
  isActive: boolean
  terminalTitle: string
  children: React.ReactNode
}

export const SlideshowSlide: FC<SlideshowSlideProps> = ({
  isActive,
  terminalTitle,
  children,
}) => {
  return (
    <div
      className={cn(
        "px-15 relative w-full max-w-5xl text-center transition-all duration-700",
        isActive ? "animate-slide-in block" : "hidden"
      )}
    >
      <TerminalHeader title={terminalTitle} />
      <div className="relative rounded-b-lg border border-t-0 border-gray-700 bg-gray-900/90 p-10 backdrop-blur-md">
        <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gradient-to-r from-teal-400 via-blue-500 to-blue-600" />
        {children}
      </div>
    </div>
  )
}
