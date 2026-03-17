import type { FC, JSX } from "react"
import { NodePopup } from "@calendar/components/life-scheduler/node-popup"
import { Rings, type RingHit } from "@calendar/components/life-scheduler/ring"
import type { NodeData } from "@calendar/types/life-scheduler"

export type PopupState = {
  type: "outer" | "inner"
  index: number
  data: NodeData
}

export type CyclicSchedulerProps = {
  outer: number
  inner: number
  running: boolean
  speed: number
  popup: PopupState | null
  onToggleRunning: () => void
  onSpeedChange: (speed: number) => void
  onHitNode: (hit: RingHit) => void
  onClosePopup: () => void
}

const N60 = 60
const N24 = 24

export const CyclicScheduler: FC<CyclicSchedulerProps> = ({
  outer,
  inner,
  running,
  speed,
  popup,
  onToggleRunning,
  onSpeedChange,
  onHitNode,
  onClosePopup,
}): JSX.Element => {
  const progress = Math.round(((outer * N60 + inner) / (N24 * N60)) * 100)
  const cycle = outer * N60 + inner

  return (
    <div className="scheduler absolute inset-0 bg-ink-900 flex flex-col items-center px-4 py-6 gap-6 text-ink-300">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="w-full max-w-2xl flex items-baseline justify-between border-b border-ink-800 pb-4">
        <div>
          <h1 className="font-mono text-[13px] font-semibold tracking-widest uppercase text-ink-100">
            cyclic scheduler
          </h1>
          <p className="text-[11px] text-ink-600 font-mono mt-0.5">
            base-24 outer × base-60 inner
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[12px] text-ink-600">
          <span className="text-violet-400">
            {String(outer).padStart(2, "0")}
          </span>
          <span className="text-ink-700">·</span>
          <span className="text-emerald-400">
            {String(inner).padStart(2, "0")}
          </span>
          <span className="text-ink-700 ml-2">cycle {cycle}</span>
        </div>
      </header>

      {/* ── Rings ──────────────────────────────────────── */}
      <main className="w-full max-w-xl flex justify-center py-8">
        <Rings outerPos={outer} innerPos={inner} onHit={onHitNode} />
      </main>

      {/* ── Controls ───────────────────────────────────── */}
      <section className="w-full max-w-xl flex flex-wrap items-center gap-4 bg-ink-800/30 p-4 rounded-xl border border-ink-800">
        <button
          onClick={onToggleRunning}
          className={`font-mono text-[11px] px-4 py-1.5 rounded-lg border transition-all ${
            running
              ? "border-violet-500/50 text-violet-400 bg-violet-500/10 hover:bg-violet-500/20"
              : "border-ink-700 text-ink-400 bg-ink-800 hover:bg-ink-700"
          }`}
        >
          {running ? "PAUSE" : "PLAY"}
        </button>

        <div className="flex items-center gap-4 flex-1 min-w-[200px]">
          <label
            htmlFor="speed-range"
            className="font-mono text-[10px] text-ink-500 uppercase tracking-tighter"
          >
            speed
          </label>
          <input
            id="speed-range"
            type="range"
            min={1}
            max={40}
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="flex-1 h-1 bg-ink-700 rounded-full appearance-none cursor-pointer accent-violet-500"
          />
          <span className="font-mono text-[12px] text-ink-400 w-6 tabular-nums">
            {speed}
          </span>
        </div>

        <div className="w-full flex items-center gap-3 mt-2">
          <div className="flex-1 h-1 bg-ink-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-ink-600 tabular-nums">
            {progress}%
          </span>
        </div>
      </section>

      {/* ── Footer legend (shown when no popup) ────────── */}
      {!popup && (
        <footer className="w-full max-w-xl">
          <div className="flex justify-between items-center text-[10px] font-mono text-ink-700 uppercase tracking-widest px-2">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                outer
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                inner
              </span>
            </div>
            <span>System Ready</span>
          </div>
        </footer>
      )}

      {/* ── Popup (draggable, portal-rendered) ─────────── */}
      {popup && (
        <NodePopup
          key={`${popup.type}-${popup.index}`}
          data={popup.data}
          type={popup.type}
          nodeIndex={popup.index}
          onClose={onClosePopup}
        />
      )}
    </div>
  )
}
