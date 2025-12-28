import "./index.css"

import type { FC } from "react"
import { cn } from "some-ui-utils"

type ScrambledCardProps = {
  className?: string
}
export const ScrambledCard: FC<ScrambledCardProps> = ({ className }) => {
  return (
    <div
      className={cn(
        "-clip relative size-full rounded-lg",
        "before:absolute before:size-10 before:rounded-full before:bg-gray-950",
        "before:bottom-1/2 before:start-0 before:-translate-x-1/2 before:translate-y-1/2",
        "after:absolute after:size-10 after:rounded-full after:bg-gray-950",
        "after:bottom-1/2 after:end-0 after:translate-x-1/2 after:translate-y-1/2",
        "flex items-center justify-center text-center tracking-wide",
        "shadow-inset-neon perspective-[600px] animate-wiggle transform-3d",
        className
      )}
    >
      <div className="inset-15 bg-neon rotate-x-85 scale-y-0.5 scale-x-155 pointer-events-none absolute translate-y-[105%] opacity-70 blur-[1em]" />
      <div
        role="separator"
        className={cn(
          "absolute bottom-1/2 h-0.5 w-full translate-y-1/2 border border-slate-300",
          "pointer-events-none -z-10"
        )}
      />
      <span className="glowing-txt">GLOW</span>
      <span className="faulty-letter">!</span>
    </div>
  )
}
