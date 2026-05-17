import type { SpreadArchetype } from "@portfolio/types"

export type TopBarProps = {
  spot: number
  positionName: string
  archetype: SpreadArchetype
  archetypeDesc: string
  onPositionNameChange: (name: string) => void
  onReset: () => void
}

const ARCHETYPE_COLOR: Partial<Record<SpreadArchetype, string>> = {
  "iron condor": "#3b82f6",
  "iron butterfly": "#8b5cf6",
  "short strangle": "#f59e0b",
  "short straddle": "#ef4444",
  "long strangle": "#22c55e",
  "long straddle": "#22c55e",
  "bull call spread": "#22c55e",
  "bear put spread": "#22c55e",
  "bull put spread": "#f59e0b",
  "bear call spread": "#f59e0b",
  "long butterfly": "#6366f1",
  "covered call": "#10b981",
}

export const TopBar: React.FC<TopBarProps> = ({
  spot,
  positionName,
  archetype,
  archetypeDesc,
  onPositionNameChange,
  onReset,
}) => {
  const color = ARCHETYPE_COLOR[archetype] ?? "#737373"

  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-5 py-3">
      {/* left: brand + ticker + archetype */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-widest text-neutral-600">
            SANDLOT
          </span>
          <span className="text-neutral-700">·</span>
          <span className="font-mono text-[15px] font-semibold tracking-wide text-neutral-100">
            NVDA
          </span>
          <span className="rounded-sm border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
            hypothetical
          </span>
        </div>

        {archetype !== "custom" && (
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-0.5"
            style={{ background: `${color}18`, border: `1px solid ${color}40` }}
          >
            <span
              className="font-mono text-[11px] font-medium"
              style={{ color }}
            >
              {archetype}
            </span>
          </div>
        )}

        {archetype !== "custom" && (
          <span className="hidden font-mono text-[10px] text-neutral-600 lg:block">
            {archetypeDesc}
          </span>
        )}
      </div>

      {/* center: spot */}
      <div className="flex flex-col items-center">
        <span className="font-mono text-[22px] font-semibold tracking-tight text-neutral-100">
          ${spot.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-neutral-600">
          sim spot · not live
        </span>
      </div>

      {/* right: name + reset */}
      <div className="flex items-center gap-3">
        <input
          value={positionName}
          onChange={(e) => onPositionNameChange(e.target.value)}
          className="rounded border border-neutral-800 bg-transparent px-2 py-1 font-mono text-[12px] text-neutral-400 outline-none focus:border-neutral-600 focus:text-neutral-200"
          placeholder="position name"
        />
        <button
          onClick={onReset}
          className="rounded border border-neutral-800 px-2 py-1 font-mono text-[11px] text-neutral-600 transition-colors hover:border-neutral-600 hover:text-neutral-400"
        >
          reset
        </button>
      </div>
    </div>
  )
}
