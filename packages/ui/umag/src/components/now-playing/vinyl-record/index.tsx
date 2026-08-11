import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import type { NowPlayingType } from "@umag/types/now-playing"
import { Play } from "lucide-react"
import { cn } from "some-ui-utils"

type VinylRecordProps = {
  onConnect: () => void
} & NowPlayingType &
  HTMLAttributes<HTMLDivElement>

export const VinylRecord = forwardRef<HTMLDivElement, VinylRecordProps>(
  (
    {
      className,
      title = "some title...",
      thumbnail = "some thumbnail...",
      onConnect,
      ...props
    },
    ref
  ) => {
    return (
      <div
        role="button"
        tabIndex={0}
        ref={ref}
        className={cn(className, "relative max-w-fit cursor-pointer")}
        {...props}
        onClick={onConnect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onConnect()
          }
        }}
      >
        {/* Outer vinyl disc */}
        {/* A vinyl record and its grooves. Black plastic with lighter
            concentric rings is the object being drawn, not a card surface, so
            these stay fixed at every theme; the neon ring around it is the
            part that carries theme. */}
        {/* eslint-disable theme-protocol/no-structural-palette-color */}
        <div className="animate-pulse-heartbeat relative size-32 overflow-hidden rounded-full border-2 border-purple-500/50 bg-gradient-to-br from-gray-900 to-black">
          {/* Vinyl grooves */}
          <div className="pointer-events-none absolute inset-2 z-0 rounded-full border border-gray-700/50" />
          <div className="pointer-events-none absolute inset-4 z-0 rounded-full border border-gray-600/30" />
          <div className="pointer-events-none absolute inset-6 z-0 rounded-full border border-gray-500/20" />
          {/* eslint-enable theme-protocol/no-structural-palette-color */}

          {/* Center album art */}
          <div className="animate-spin-slow absolute inset-8 overflow-hidden rounded-full border-2 border-purple-400/60">
            <img
              src={thumbnail || "/placeholder.svg"}
              alt={`${title} album art`}
              className="pointer-events-none z-0 size-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null // stop future retries
                e.currentTarget.src = ""
              }}
            />
            {/* Play icon overlay */}
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-500/60">
              <Play className="z-50 size-6 fill-white text-white" />
            </div>
          </div>
        </div>

        {/* Neon glow ring */}
        <div className="animate-pulse-glow absolute inset-0 rounded-full border-2 border-purple-400/30" />
      </div>
    )
  }
)

VinylRecord.displayName = "VinylRecord"
