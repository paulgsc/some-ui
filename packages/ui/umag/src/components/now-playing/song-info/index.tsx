import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { Marquee } from "some-ui-shared"
import { cn } from "some-ui-utils"

type SongInfoProps = {
  title?: string
  artist?: string
  subtitle?: string
} & HTMLAttributes<HTMLDivElement>

export const SongInfo = forwardRef<HTMLDivElement, SongInfoProps>(
  (
    {
      className,
      title = "some title...",
      artist = "some artist...",
      subtitle = "some subtitle...",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          className,
          "grid size-full min-w-0 justify-end rounded-full"
        )}
        {...props}
      >
        <div className="text-center text-sm font-medium uppercase tracking-wider text-purple-300 opacity-80">
          Now Playing
        </div>

        {/* Song Title */}
        <Marquee pauseOnHover className="w-full rounded-full [--duration:20s]">
          <h2 className="text-xl font-bold capitalize leading-tight text-white">
            {title}
          </h2>
        </Marquee>

        {/* Artist Name */}
        <Marquee pauseOnHover className="w-full rounded-full [--duration:20s]">
          <p className="text-lg capitalize text-purple-300">{artist}</p>
        </Marquee>

        {/* Subtitle */}
        {subtitle && (
          <Marquee
            pauseOnHover
            className="w-full rounded-full [--duration:20s]"
          >
            <p className="animate-marquee text-sm text-gray-400">{subtitle}</p>
          </Marquee>
        )}
      </div>
    )
  }
)

SongInfo.displayName = "SongInfo"
