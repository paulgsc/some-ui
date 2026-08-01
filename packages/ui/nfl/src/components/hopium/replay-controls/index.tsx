import type { JSX } from "react"
import { Button, Slider } from "@some-ui/shared"
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react"

type Props = {
  playing: boolean
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onReset: () => void
  speed: number
  setSpeed: (v: number) => void
}

export const ReplayControls = ({
  playing,
  onToggle,
  onPrev,
  onNext,
  onReset,
  speed,
  setSpeed,
}: Props): JSX.Element => {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800/60 p-2">
      <Button
        size="icon"
        variant="secondary"
        onClick={onPrev}
        className="bg-slate-700 text-slate-100 hover:bg-slate-600"
      >
        <SkipBack className="size-4" />
      </Button>
      <Button
        size="icon"
        onClick={onToggle}
        className="bg-blue-600 text-white hover:bg-blue-700"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={onNext}
        className="bg-slate-700 text-slate-100 hover:bg-slate-600"
      >
        <SkipForward className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={onReset}
        className="bg-slate-700 text-slate-100 hover:bg-slate-600"
      >
        <RotateCcw className="size-4" />
      </Button>

      <div className="ml-3 flex items-center gap-2">
        <span className="text-xs text-slate-300">Speed</span>
        <Slider
          value={[speed]}
          min={0.5}
          max={2}
          step={0.25}
          onValueChange={(v) => setSpeed(v[0] ?? 1)}
          className="w-32"
        />
        <span className="text-xs text-slate-300">{speed.toFixed(2)}x</span>
      </div>
    </div>
  )
}
