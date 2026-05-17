import { useState } from "react"
import type { Leg } from "@portfolio/types"

export type LegRowProps = {
  leg: Leg
  pl: number
  onRemove: (id: string) => void
}

function fmtExpiry(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export const LegRow: React.FC<LegRowProps> = ({ leg, pl, onRemove }) => {
  const [hovered, setHovered] = useState(false)
  const sideColor = leg.side === "long" ? "#22c55e" : "#ef4444"
  const plColor = pl >= 0 ? "#22c55e" : "#ef4444"

  return (
    <div
      className="group relative flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2 transition-colors hover:border-neutral-700"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase"
            style={{ color: sideColor, background: `${sideColor}18` }}
          >
            {leg.side}
          </span>
          <span className="font-mono text-[12px] font-medium text-neutral-100">
            {leg.optionType} · ${leg.strike}
          </span>
        </div>
        <span className="font-mono text-[10px] text-neutral-500">
          {fmtExpiry(leg.expiry)} · ×{leg.quantity} · prem $
          {leg.premium.toFixed(2)} · IV {Math.round(leg.iv * 100)}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className="font-mono text-[13px] font-semibold"
          style={{ color: plColor }}
        >
          {pl >= 0 ? "+" : ""}${pl.toFixed(0)}
        </span>
        {hovered && (
          <button
            onClick={() => onRemove(leg.id)}
            className="text-neutral-600 transition-colors hover:text-red-400"
            aria-label={`remove ${leg.side} ${leg.optionType} $${leg.strike}`}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
