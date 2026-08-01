import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"

type Region = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

type GraphSelectProps = {
  regions: Array<Region>
  onSubmit: (selectedIds: Array<string>) => void
  disabled?: boolean
  correctRegions?: Array<string>
  showResult?: boolean
  multiSelect?: boolean
}

export const GraphSelect = ({
  regions,
  onSubmit,
  disabled = false,
  correctRegions = [],
  showResult = false,
  multiSelect = false,
}: GraphSelectProps): JSX.Element => {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleRegion = (id: string): void => {
    if (disabled) return

    if (multiSelect) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    } else {
      setSelected(new Set([id]))
      onSubmit([id])
    }
  }

  const handleSubmit = (): void => {
    if (disabled) return
    onSubmit(Array.from(selected))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full h-48 bg-card rounded-lg border border-border overflow-hidden">
        {/* Grid background */}
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#2a2a2a"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Selectable regions */}
        {regions.map((region) => {
          const isSelected = selected.has(region.id)
          const isCorrect = showResult && correctRegions.includes(region.id)
          const isWrong =
            showResult && isSelected && !correctRegions.includes(region.id)
          const isMissed =
            showResult && !isSelected && correctRegions.includes(region.id)

          return (
            <button
              key={region.id}
              onClick={() => toggleRegion(region.id)}
              disabled={disabled}
              className={`
                absolute rounded-md border-2 transition-all duration-200 flex items-center justify-center
                ${disabled ? "cursor-default" : "cursor-pointer hover:bg-primary/20"}
                ${isSelected && !showResult ? "border-primary bg-primary/30" : "border-transparent bg-secondary/30"}
                ${isCorrect ? "border-success bg-success/30" : ""}
                ${isWrong ? "border-destructive bg-destructive/30" : ""}
                ${isMissed ? "border-success/50 bg-success/10" : ""}
              `}
              style={{
                left: `${region.x}%`,
                top: `${region.y}%`,
                width: `${region.width}%`,
                height: `${region.height}%`,
              }}
            >
              <span className="font-mono text-xs text-foreground/70">
                {region.label}
              </span>
            </button>
          )
        })}
      </div>

      {multiSelect && !disabled && !showResult && (
        <Button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="w-full"
        >
          Submit Selection
        </Button>
      )}
    </div>
  )
}
