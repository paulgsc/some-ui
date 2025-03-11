import { Slider } from "@/components/ui/slider"

import type { AnimationPattern } from "../hooks/useDialAnimation"

type DialControlsProps = {
  animationPattern: AnimationPattern
  setAnimationPattern: (pattern: AnimationPattern) => void
  volume: number
  setVolume: (volume: number) => void
  isMuted: boolean
  setIsMuted: (muted: boolean) => void
}

export const DialControls = ({
  animationPattern,
  setAnimationPattern,
  volume,
  setVolume,
  isMuted,
  setIsMuted,
}: DialControlsProps) => {
  return (
    <div className="w-full space-y-4 rounded-lg bg-gray-100 p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Animation Pattern:</label>
        <div className="flex gap-2">
          <button
            className={`rounded px-3 py-1 ${animationPattern === "linear" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setAnimationPattern("linear")}
          >
            Linear
          </button>
          <button
            className={`rounded px-3 py-1 ${animationPattern === "bounce" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setAnimationPattern("bounce")}
          >
            Bounce
          </button>
          <button
            className={`rounded px-3 py-1 ${animationPattern === "elastic" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setAnimationPattern("elastic")}
          >
            Elastic
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Sound Volume:</label>
          <button
            className="text-sm text-blue-500"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
        <Slider
          disabled={isMuted}
          value={[volume * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={(value) => setVolume(value[0] / 100)}
        />
      </div>
    </div>
  )
}
