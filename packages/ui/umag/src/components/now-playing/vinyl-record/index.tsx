import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { Play } from "lucide-react"
import { cn } from "some-ui-utils"

type VinylRecordProps = {
  albumArtUrl?: string
  title?: string
} & HTMLAttributes<HTMLDivElement>

export const VinylRecord = forwardRef<HTMLDivElement, VinylRecordProps>(
  (
    {
      className,
      title = "some title...",
      albumArtUrl = "some thumbnail...",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(className, "relative flex-shrink-0")}
        {...props}
      >
        {/* Outer vinyl disc */}
        <div className="animate-spin-slow animate-pulse-heartbeat relative size-32 overflow-hidden rounded-full border-2 border-purple-500/50 bg-gradient-to-br from-gray-900 to-black">
          {/* Vinyl grooves */}
          <div className="absolute inset-2 rounded-full border border-gray-700/50" />
          <div className="absolute inset-4 rounded-full border border-gray-600/30" />
          <div className="absolute inset-6 rounded-full border border-gray-500/20" />

          {/* Center album art */}
          <div className="absolute inset-8 overflow-hidden rounded-full border-2 border-purple-400/60">
            <img
              src={albumArtUrl || "/placeholder.svg"}
              alt={`${title} album art`}
              className="size-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = "/placeholder.svg?height=64&width=64"
              }}
            />
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Play className="size-6 fill-white text-white" />
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
