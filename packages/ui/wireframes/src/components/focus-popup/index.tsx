import type { JSX } from "react"
import { startTransition, useEffect, useState } from "react"

type FocusControlPopupProps<T extends string> = {
  regionId: T
  position: { x: number; y: number }
  onApply: (regionId: T, intensity: number) => void
  onClose: () => void

  // Optional: customize UI
  title?: string
  minIntensity?: number
  maxIntensity?: number
  step?: number
}

export const FocusControlPopup = <T extends string>({
  regionId,
  position,
  onApply,
  onClose,
  title = "Focus",
  minIntensity = 0,
  maxIntensity = 1,
  step = 0.05,
}: FocusControlPopupProps<T>): JSX.Element => {
  const [intensity, setIntensity] = useState(maxIntensity)
  const [popupPosition, setPopupPosition] = useState(position)

  // Ensure popup stays within viewport bounds
  useEffect(() => {
    const { innerWidth, innerHeight } = window

    // Clamp position to viewport
    const clampedX = Math.max(100, Math.min(innerWidth - 100, position.x))
    const clampedY = Math.max(50, Math.min(innerHeight - 150, position.y))

    startTransition(() => setPopupPosition({ x: clampedX, y: clampedY }))
  }, [position])

  return (
    <div
      style={{
        position: "fixed",
        left: popupPosition.x,
        top: popupPosition.y,
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
      }}
      className="bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 min-w-[220px]"
    >
      <div className="text-sm font-semibold mb-2">
        {title}: <span className="text-blue-600">{regionId}</span>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-600 mb-1">
          Intensity: {intensity.toFixed(2)}
        </label>
        <input
          type="range"
          min={minIntensity}
          max={maxIntensity}
          step={step}
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{minIntensity}</span>
          <span>{maxIntensity}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onApply(regionId, intensity)}
          className="flex-1 bg-blue-500 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-600 transition-colors"
        >
          Apply
        </button>
        <button
          onClick={onClose}
          className="flex-1 bg-gray-200 px-3 py-1.5 rounded text-sm hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
