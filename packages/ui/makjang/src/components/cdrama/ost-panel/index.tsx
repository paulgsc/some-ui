import { Music, Star } from "lucide-react"

interface OSTPanelProps {
  score: number
  ranking: number
  favoriteTrack: string
}

export function OSTPanel({ score, ranking, favoriteTrack }: OSTPanelProps) {
  return (
    <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/90 via-purple-900/40 to-blue-900/90 p-6 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-3">
        <Music className="h-5 w-5 text-purple-400" />
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-purple-400">
          OST Evaluation
        </h2>
      </div>

      <div className="space-y-4">
        {/* Score */}
        <div className="rounded-xl border border-purple-400/20 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-slate-300">Score</span>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="font-mono text-2xl font-bold text-white">
                {score.toFixed(1)}
              </span>
              <span className="font-mono text-sm text-slate-400">/ 10</span>
            </div>
          </div>
        </div>

        {/* Ranking */}
        <div className="rounded-xl border border-purple-400/20 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-slate-300">
              Personal Ranking
            </span>
            <span className="font-mono text-2xl font-bold text-purple-400">
              #{ranking}
            </span>
          </div>
        </div>

        {/* Favorite Track */}
        <div className="rounded-xl border border-purple-400/20 bg-slate-900/50 p-4">
          <div className="mb-2 font-mono text-xs text-slate-400">
            Favorite Track
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
            <span className="font-mono text-sm text-white">
              {favoriteTrack}
            </span>
          </div>
        </div>

        {/* Visualizer */}
        <div className="flex h-16 items-end justify-center gap-1 rounded-xl border border-purple-400/20 bg-slate-900/50 p-4">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-purple-500 to-cyan-400"
              style={{
                height: `${Math.random() * 100}%`,
                animation: `pulse ${0.5 + Math.random()}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
