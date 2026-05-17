import type { SimState } from "@portfolio/types"

export type SimControlsProps = {
  sim: SimState
  onSpotChange: (v: number) => void
  onDTEChange: (v: number) => void
  onIVShiftChange: (v: number) => void
  spotMin?: number
  spotMax?: number
}

type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  accent?: boolean
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  accent,
}) => {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 font-mono text-[11px] text-neutral-400">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full outline-none"
        style={{
          background: `linear-gradient(to right, ${accent ? "#3b82f6" : "#525252"} ${pct}%, #262626 ${pct}%)`,
        }}
        aria-label={label}
      />
      <span
        className="w-20 shrink-0 text-right font-mono text-[12px] font-medium"
        style={{ color: accent ? "#3b82f6" : undefined }}
      >
        {format(value)}
      </span>
    </div>
  )
}

export const SimControls: React.FC<SimControlsProps> = ({
  sim,
  onSpotChange,
  onDTEChange,
  onIVShiftChange,
  spotMin = 60,
  spotMax = 200,
}) => {
  const ivPct = Math.round(sim.ivShift * 100)
  return (
    <div className="flex flex-col gap-3 border-t border-neutral-800 px-4 py-3">
      <Slider
        label="spot"
        value={sim.spot}
        min={spotMin}
        max={spotMax}
        step={0.5}
        format={(v) => `$${v.toFixed(2)}`}
        onChange={onSpotChange}
        accent
      />
      <Slider
        label="DTE"
        value={sim.dte}
        min={0}
        max={90}
        step={1}
        format={(v) => `${v}d`}
        onChange={onDTEChange}
      />
      <Slider
        label="IV Δ"
        value={ivPct}
        min={-50}
        max={100}
        step={1}
        format={(v) => (v >= 0 ? `+${v}%` : `${v}%`)}
        onChange={(v) => onIVShiftChange(v / 100)}
      />
    </div>
  )
}
