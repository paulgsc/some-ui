import type { ReactNode } from "react"
import type { HexPoint, HexRenderData } from "@some-ui/honeycomb"

import { cellAccentStyle } from "@/lib/site-honeycomb/cell-accent-style"
import { DISCIPLINE_TOKENS, STATUS_TOKENS } from "@/lib/site-honeycomb/tokens"
import type { WorkBay } from "@/lib/site-honeycomb/types"

export type EmptyCellPayload = { kind: "empty" }

export type BayCellPayload = {
  kind: "bay"
  bay: WorkBay
  isInspected: boolean
  isFocused: boolean
  isReceding: boolean
  isYielding: boolean
  onEnter: (bay: WorkBay) => void
  onLeave: (bay: WorkBay) => void
  onOpenWorkOrder: (bay: WorkBay) => void
  onOpenActions: (bay: WorkBay) => void
  registerRef: (bay: WorkBay) => (el: HTMLButtonElement | null) => void
}

export type SiteCellPayload = EmptyCellPayload | BayCellPayload

const EmptyHexDecoration = ({
  cellId,
  hexPath,
}: {
  cellId: string
  hexPath: string
}): ReactNode => {
  const patternId = `site-hatch-${cellId}`
  return (
    <>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={6}
            stroke="oklch(0.34 0.02 260)"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <path d={hexPath} fill={`url(#${patternId})`} />
    </>
  )
}

/**
 * Rest/inspect rendering only. Primary activation hands off to a
 * screen-space overlay (focus-overlay.tsx) rather than growing this cell's
 * own foreignObject in place: `HexGrid` paints populated cells in the WASM
 * grid's `HashMap` iteration order, which is unspecified, so an expanded
 * cell can't be guaranteed to paint above its neighbors from inside the
 * SVG. While focused, this renders as an inert, accent-tinted placeholder
 * — the overlay owns the actual interactive content, anchored over it.
 */
export function renderSiteHexCell(
  cell: HexRenderData<SiteCellPayload>,
  centerX: number,
  centerY: number,
  cellWidth: number,
  hexPath: string
): ReactNode {
  const payload = cell.content?.data

  if (!payload || payload.kind === "empty") {
    return <EmptyHexDecoration cellId={cell.id} hexPath={hexPath} />
  }

  const ys = cell.points.map((p: HexPoint) => p.y)
  const cellHeight = Math.max(...ys) - Math.min(...ys)

  const {
    bay,
    isInspected,
    isFocused,
    isReceding,
    isYielding,
    onEnter,
    onLeave,
    onOpenWorkOrder,
    onOpenActions,
    registerRef,
  } = payload

  const accent = DISCIPLINE_TOKENS[bay.discipline].accent
  const statusToken = STATUS_TOKENS[bay.status]
  const Icon = bay.icon

  const fx = centerX - cellWidth / 2
  const fy = centerY - cellHeight / 2
  const restFill = "oklch(0.24 0.016 260)"
  const buttonBackground = isFocused
    ? `color-mix(in oklab, ${accent} 34%, ${restFill})`
    : isInspected
      ? `color-mix(in oklab, ${accent} 20%, ${restFill})`
      : restFill

  return (
    <g
      className="site-hex-group"
      data-recede={isReceding ? "true" : undefined}
      data-yield={isYielding ? "true" : undefined}
      style={cellAccentStyle(accent)}
    >
      <foreignObject
        x={fx}
        y={fy}
        width={cellWidth}
        height={cellHeight}
        style={{ overflow: "visible" }}
      >
        <div className="site-hex-hit" style={{ width: "100%", height: "100%" }}>
          {isFocused ? (
            <div
              aria-hidden
              className="site-hex-btn"
              style={{
                width: "100%",
                height: "100%",
                background: buttonBackground,
              }}
            />
          ) : (
            <button
              type="button"
              ref={registerRef(bay)}
              className="site-hex-btn"
              data-active={isInspected ? "true" : undefined}
              aria-label={`${bay.title} — ${statusToken.label}`}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: buttonBackground,
              }}
              onMouseEnter={() => onEnter(bay)}
              onMouseLeave={() => onLeave(bay)}
              onFocus={() => onEnter(bay)}
              onBlur={() => onLeave(bay)}
              onClick={() => onOpenWorkOrder(bay)}
              onKeyDown={(event) => {
                if (event.key === "F10" && event.shiftKey) {
                  event.preventDefault()
                  onOpenActions(bay)
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onOpenActions(bay)
              }}
            >
              <span
                className="site-honeycomb-mono"
                style={{ fontSize: 10, opacity: 0.8 }}
              >
                {bay.completion}%
              </span>
              <Icon
                aria-hidden
                className={statusToken.motionClass}
                style={{
                  width: Math.max(16, cellWidth * 0.22),
                  height: Math.max(16, cellWidth * 0.22),
                  color: accent,
                }}
              />
            </button>
          )}
        </div>
      </foreignObject>
    </g>
  )
}
