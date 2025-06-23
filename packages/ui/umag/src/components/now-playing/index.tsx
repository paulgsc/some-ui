import { useNowPlaying } from "@umag/hooks/use-now-playing"
import { Music, Play } from "lucide-react"
import { Marquee } from "some-ui-shared"

type NowPlayingProps = {
  title: string
  artist: string
  albumArtUrl: string
  subtitle?: string
}

export const NowPlayingCard = ({
  title,
  artist,
  albumArtUrl,
  subtitle,
}: NowPlayingProps) => {
  const { processedData } = useNowPlaying({
    title,
    artist,
    albumArtUrl,
    subtitle,
  })

  return (
    <div className="relative size-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      {/* Background glow effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 blur-xl" />

      {/* Streaming musical notes from disc */}
      <div className="pointer-events-none absolute inset-0">
        {/* Ring 1 - Close to disc */}
        <div className="absolute left-20 top-12">
          <Music className="animate-stream-1 size-4 text-purple-400 opacity-0" />
        </div>
        <div className="absolute left-12 top-20">
          <Music className="animate-stream-2 size-3 text-blue-300 opacity-0" />
        </div>
        <div className="absolute left-28 top-24">
          <Music className="animate-stream-3 size-5 text-cyan-400 opacity-0" />
        </div>
        <div className="absolute left-32 top-16">
          <Music className="animate-stream-4 size-4 text-pink-300 opacity-0" />
        </div>

        {/* Ring 2 - Medium distance */}
        <div className="absolute left-16 top-8">
          <Music className="animate-stream-5 size-6 text-purple-300 opacity-0" />
        </div>
        <div className="absolute left-8 top-28">
          <Music className="animate-stream-6 size-4 text-blue-400 opacity-0" />
        </div>
        <div className="absolute left-24 top-32">
          <Music className="animate-stream-7 size-5 text-cyan-300 opacity-0" />
        </div>
        <div className="absolute left-24 top-4">
          <Music className="animate-stream-8 size-3 text-pink-400 opacity-0" />
        </div>
        <div className="absolute left-4 top-20">
          <Music className="animate-stream-9 size-4 text-purple-500 opacity-0" />
        </div>

        {/* Ring 3 - Far from disc */}
        <div className="absolute left-8 top-2">
          <Music className="animate-stream-10 size-7 text-purple-400 opacity-0" />
        </div>
        <div className="absolute left-2 top-36">
          <Music className="animate-stream-11 size-5 text-blue-300 opacity-0" />
        </div>
        <div className="absolute left-16 top-40">
          <Music className="animate-stream-12 size-6 text-cyan-400 opacity-0" />
        </div>
        <div className="absolute left-32 top-2">
          <Music className="animate-stream-13 size-4 text-pink-300 opacity-0" />
        </div>
        <div className="absolute left-36 top-36">
          <Music className="animate-stream-14 size-5 text-purple-300 opacity-0" />
        </div>

        {/* Right side streams */}
        <div className="absolute right-20 top-12">
          <Music className="animate-stream-15 size-4 text-blue-400 opacity-0" />
        </div>
        <div className="absolute right-12 top-20">
          <Music className="animate-stream-16 size-6 text-purple-300 opacity-0" />
        </div>
        <div className="absolute right-8 top-28">
          <Music className="animate-stream-17 size-3 text-cyan-400 opacity-0" />
        </div>
        <div className="absolute right-16 top-8">
          <Music className="animate-stream-18 size-5 text-pink-400 opacity-0" />
        </div>
        <div className="absolute right-24 top-32">
          <Music className="animate-stream-19 size-4 text-purple-400 opacity-0" />
        </div>
        <div className="absolute right-4 top-4">
          <Music className="animate-stream-20 size-7 text-blue-300 opacity-0" />
        </div>
      </div>

      <div className="relative z-10 flex h-full items-center gap-6">
        {/* Vinyl Record Section */}
        <div className="relative flex-shrink-0">
          {/* Outer vinyl disc */}
          <div className="animate-spin-slow animate-pulse-heartbeat relative size-32 overflow-hidden rounded-full border-2 border-purple-500/50 bg-gradient-to-br from-gray-900 to-black">
            {/* Vinyl grooves */}
            <div className="absolute inset-2 rounded-full border border-gray-700/50" />
            <div className="absolute inset-4 rounded-full border border-gray-600/30" />
            <div className="absolute inset-6 rounded-full border border-gray-500/20" />

            {/* Center album art */}
            <div className="absolute inset-8 overflow-hidden rounded-full border-2 border-purple-400/60">
              <img
                src={processedData.albumArtUrl || "/placeholder.svg"}
                alt={`${processedData.title} album art`}
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

        {/* Song Info Section */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-purple-300 opacity-80">
            Now Playing
          </div>

          {/* Song Title */}
          <Marquee pauseOnHover className="w-fit max-w-xs [--duration:20s]">
            <h2 className="text-xl font-bold leading-tight text-white">
              {processedData.title}
            </h2>
          </Marquee>

          {/* Artist Name */}
          <Marquee pauseOnHover className="w-fit max-w-xs [--duration:20s]">
            <p className="text-lg text-purple-300">{processedData.artist}</p>
          </Marquee>

          {/* Subtitle */}
          {processedData.subtitle && (
            <Marquee pauseOnHover className="w-fit max-w-xs [--duration:20s]">
              <p className="animate-marquee text-sm text-gray-400">
                {processedData.subtitle}
              </p>
            </Marquee>
          )}
        </div>
      </div>
    </div>
  )
}
