import type { FC, JSX } from "react"
import { NodePopup } from "@calendar/components/life-scheduler/node-popup"
import { Rings, type RingHit } from "@calendar/components/life-scheduler/ring"
import type { NodeData } from "@calendar/types/life-scheduler"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

export type PopupState = {
  type: "outer" | "inner"
  index: number
  data: NodeData
}

export type CyclicSchedulerProps = {
  outer: number // Current Hour (0-23)
  inner: number // Current Minute (0-59)
  popup: PopupState | null
  onHitNode: (hit: RingHit) => void
  onClosePopup: () => void
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established. Pass `"scheduler"` to opt into the standalone scheduler
   * palette, which replaces the substrate for this subtree.
   */
  appearance?: Appearance
}

const N60 = 60
const N24 = 24

export const CyclicScheduler: FC<CyclicSchedulerProps> = ({
  outer,
  inner,
  popup,
  onHitNode,
  onClosePopup,
  appearance = "inherit",
}): JSX.Element => {
  const dayProgress = Math.round(((outer * N60 + inner) / (N24 * N60)) * 100)

  // Helper to trigger popup for current time indices
  const inspectCurrent = (type: "outer" | "inner"): void => {
    onHitNode({
      type,
      index: type === "outer" ? outer : inner,
      // The logic for fetching the specific NodeData would typically reside
      // in the parent's onHitNode handler or a shared store.
    })
  }

  return (
    <div
      className={`${appearanceClassName(appearance)} absolute inset-0 bg-ink-950 flex flex-col items-center px-6 py-10 gap-8 text-ink-300`.trim()}
    >
      {/* ── Life Telemetry Header ─────────────────────── */}
      <header className="w-full max-w-2xl text-center space-y-2">
        <h1 className="text-2xl font-light tracking-[0.2em] text-ink-50 uppercase">
          Life Day Scheduler
        </h1>
        <p className="text-sm text-ink-500 font-serif italic">
          Mapping the architecture of your day, from rest to deep work.
        </p>
      </header>

      {/* ── Main Ring Display ─────────────────────────── */}
      <main className="relative w-full max-w-xl flex justify-center py-4">
        <Rings
          outerPos={outer}
          innerPos={inner}
          onHit={onHitNode}
          appearance={appearance}
        />
      </main>

      {/* ── Telemetry & Quick Actions ─────────────────── */}
      <section className="w-full max-w-md space-y-6">
        {/* Progress Metrics */}
        <div className="space-y-2">
          <div className="flex justify-between items-end px-1">
            <span className="text-[10px] uppercase tracking-widest text-ink-500 font-semibold">
              Day Completion
            </span>
            <span className="text-xl font-mono text-emerald-400">
              {dayProgress}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-ink-900 rounded-full overflow-hidden border border-ink-800">
            <div
              className="h-full bg-gradient-to-r from-violet-600 via-emerald-500 to-sky-500 transition-all duration-1000 ease-in-out"
              style={{ width: `${dayProgress}%` }}
            />
          </div>
        </div>

        {/* Quick Inspection Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => inspectCurrent("outer")}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-ink-800 bg-ink-900/50 hover:bg-ink-800 transition-colors group"
          >
            <span className="text-[9px] uppercase tracking-[0.2em] text-ink-600 group-hover:text-violet-400">
              Inspect Hour
            </span>
            <span className="font-mono text-lg text-ink-200">{outer}h</span>
          </button>

          <button
            onClick={() => inspectCurrent("inner")}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-ink-800 bg-ink-900/50 hover:bg-ink-800 transition-colors group"
          >
            <span className="text-[9px] uppercase tracking-[0.2em] text-ink-600 group-hover:text-emerald-400">
              Inspect Minute
            </span>
            <span className="font-mono text-lg text-ink-200">{inner}m</span>
          </button>
        </div>
      </section>

      {/* ── Footer Status ─────────────────────────────── */}
      <footer className="mt-auto w-full max-w-2xl border-t border-ink-900 pt-6 flex justify-between items-center opacity-60">
        <div className="flex gap-6 text-[10px] font-mono tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <span>Hour Cadence</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Minute Nodes</span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-ink-700">
          Live Telemetry Active
        </span>
      </footer>

      {/* ── Popup Overlay ─────────────────────────────── */}
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
