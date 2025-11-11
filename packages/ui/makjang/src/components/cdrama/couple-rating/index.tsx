import { Heart } from "lucide-react"

interface CoupleRatingProps {
  coupleName: string
  rating: number
  hypeVsActual: number
  mlRank: number
  flRank: number
}

export function CoupleRating({
  coupleName,
  rating,
  hypeVsActual,
  mlRank,
  flRank,
}: CoupleRatingProps) {
  const hypePercentage = ((hypeVsActual + 1) / 2) * 100

  return (
    <div className="space-y-4 rounded-2xl border border-pink-500/20 bg-gradient-to-br from-slate-900/90 via-pink-900/30 to-purple-900/90 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Heart className="h-5 w-5 text-pink-400" />
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-pink-400">
          Couple Rating
        </h2>
      </div>

      <div className="space-y-4">
        {/* Couple Name */}
        <div className="text-center">
          <div className="font-mono text-xl font-bold text-white">
            {coupleName}
          </div>
        </div>

        {/* Rating Circle */}
        <div className="flex justify-center">
          <div className="relative h-32 w-32">
            <svg className="h-full w-full -rotate-90 transform">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="rgba(100, 100, 100, 0.2)"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="url(#coupleGradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(rating / 10) * 351.86} 351.86`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient
                  id="coupleGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#ec4899" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-3xl font-bold text-white">
                {rating}
              </div>
              <div className="font-mono text-xs text-slate-400">/ 10</div>
            </div>
          </div>
        </div>

        {/* Hype vs Actual */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs text-slate-400">
              Hype vs Actual
            </span>
            <span className="font-mono text-xs text-white">
              {hypeVsActual > 0 ? "+" : ""}
              {(hypeVsActual * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                hypeVsActual >= 0
                  ? "bg-gradient-to-r from-green-500 to-emerald-500"
                  : "bg-gradient-to-r from-orange-500 to-red-500"
              }`}
              style={{ width: `${hypePercentage}%` }}
            />
          </div>
        </div>

        {/* Actor Rankings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-blue-400/20 bg-slate-900/50 p-3 text-center">
            <div className="font-mono text-xs text-slate-400">ML Rank</div>
            <div className="mt-1 font-mono text-2xl font-bold text-blue-400">
              #{mlRank}
            </div>
          </div>
          <div className="rounded-lg border border-pink-400/20 bg-slate-900/50 p-3 text-center">
            <div className="font-mono text-xs text-slate-400">FL Rank</div>
            <div className="mt-1 font-mono text-2xl font-bold text-pink-400">
              #{flRank}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
