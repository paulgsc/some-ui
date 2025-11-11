import { Eye, Gauge, RotateCcw } from "lucide-react"

interface MetricsPanelProps {
  overallRating: number
  likelihoodToFinish: number
  rewatchValue: number
}

export function MetricsPanel({
  overallRating,
  likelihoodToFinish,
  rewatchValue,
}: MetricsPanelProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-blue-900/70 to-purple-900/90 p-6 backdrop-blur-xl">
      <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-cyan-400">
        Engagement Metrics
      </h2>

      <div className="space-y-4">
        {/* Overall Rating */}
        <div className="group relative overflow-hidden rounded-xl border border-cyan-400/20 bg-slate-900/50 p-4 transition-all hover:border-cyan-400/40">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-2">
                <Gauge className="h-5 w-5 text-cyan-400" />
              </div>
              <span className="font-mono text-sm text-slate-300">
                Overall Rating
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-bold text-white">
                {overallRating.toFixed(1)}
              </div>
              <div className="font-mono text-xs text-slate-400">/ 10.0</div>
            </div>
          </div>
        </div>

        {/* Likelihood to Finish */}
        <div className="group relative overflow-hidden rounded-xl border border-purple-400/20 bg-slate-900/50 p-4 transition-all hover:border-purple-400/40">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <Eye className="h-5 w-5 text-purple-400" />
                </div>
                <span className="font-mono text-sm text-slate-300">
                  Likelihood to Finish
                </span>
              </div>
              <span className="font-mono text-xl font-bold text-white">
                {(likelihoodToFinish * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                style={{ width: `${likelihoodToFinish * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Rewatch Value */}
        <div className="group relative overflow-hidden rounded-xl border border-pink-400/20 bg-slate-900/50 p-4 transition-all hover:border-pink-400/40">
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-pink-500/10 p-2">
                  <RotateCcw className="h-5 w-5 text-pink-400" />
                </div>
                <span className="font-mono text-sm text-slate-300">
                  Rewatch Value
                </span>
              </div>
              <span className="font-mono text-xl font-bold text-white">
                {(rewatchValue * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-500"
                style={{ width: `${rewatchValue * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
