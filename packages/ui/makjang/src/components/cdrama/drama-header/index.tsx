import { Film } from "lucide-react"

interface DramaHeaderProps {
  dramaId: string
  episodeNumber: number
  thumbnailUrl: string
  currentMinute: number
}

export function DramaHeader({
  dramaId,
  episodeNumber,
  thumbnailUrl,
  currentMinute,
}: DramaHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-slate-900/80 via-blue-900/60 to-purple-900/80 p-6 backdrop-blur-xl">
      <div className="absolute inset-0 bg-[url('/abstract-tech-pattern.png')] opacity-5" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="relative h-20 w-32 overflow-hidden rounded-lg border border-cyan-400/30">
            <img
              src={thumbnailUrl || "/placeholder.svg"}
              alt="Drama thumbnail"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Film className="h-5 w-5 text-cyan-400" />
              <h1 className="font-mono text-2xl font-bold tracking-wider text-white">
                {dramaId.replace(/-/g, " ").toUpperCase()}
              </h1>
            </div>
            <p className="font-mono text-sm text-cyan-300">
              Episode {episodeNumber} • {currentMinute}:00 / 45:00
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-sm uppercase tracking-wider text-red-400">
            Live Tracking
          </span>
        </div>
      </div>
    </div>
  )
}
