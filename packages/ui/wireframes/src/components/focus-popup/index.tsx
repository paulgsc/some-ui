import { useEffect, useState } from "react"
import type { YouTubeRegion } from "some-types-utils"

type FocusControlPopupProps = {
  regionId: YouTubeRegion
  onApply: (regionId: YouTubeRegion, intensity: number) => void
  onClose: () => void
}

export const FocusControlPopup = ({
  regionId,
  onApply,
  onClose,
}: FocusControlPopupProps) => {
  const [intensity, setIntensity] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  // Compute center of viewport
  useEffect(() => {
    const { innerWidth, innerHeight } = window
    setPosition({
      x: innerWidth / 2,
      y: innerHeight / 2,
    })
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)", // center
        zIndex: 1000,
      }}
      className="bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 min-w-[200px]"
    >
      <div className="text-sm font-semibold mb-2">Focus: {regionId}</div>
      <div className="mb-3">
        <label className="block text-xs text-gray-600 mb-1">
          Intensity: {intensity.toFixed(2)}
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onApply(regionId, intensity)}
          className="flex-1 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
        >
          Apply
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
