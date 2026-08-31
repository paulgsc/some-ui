import { useEffect, useRef, type JSX } from "react"

import { cellAccentStyle } from "@/lib/site-honeycomb/cell-accent-style"
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  cellCenter,
} from "@/lib/site-honeycomb/hex-pixel"
import { DISCIPLINE_TOKENS } from "@/lib/site-honeycomb/tokens"
import type {
  Discipline,
  ExpandedState,
  WorkBay,
} from "@/lib/site-honeycomb/types"
import type { SvgViewport } from "@/lib/site-honeycomb/use-svg-viewport"

import { FocusedBayContent } from "./focused-bay-content"

const FOCUS_WIDTH_SCALE = 2.6
const FOCUS_HEIGHT_SCALE = 2.3
const FOCUS_PULL = 0.55

type FocusOverlayProps = {
  expanded: ExpandedState
  bay: WorkBay
  viewport: SvgViewport
  onCollapse: () => void
  onOpenWorkOrder: (bay: WorkBay) => void
  onPinDiscipline: (discipline: Discipline) => void
}

/**
 * The selected cell's territory, grown to a readable size. An HTML sibling
 * of the grid's `<svg>` rather than something rendered inside it — see
 * site-hex-cell.tsx for why `HexGrid`'s internal paint order can't be
 * trusted to put an expanded cell above its neighbors — but anchored to
 * that cell's real on-screen position via `viewport` (from
 * `useSvgViewport`) and grown from there, so it still reads as that cell
 * becoming the detail surface rather than a detached rectangle.
 */
export const FocusOverlay = ({
  expanded,
  bay,
  viewport,
  onCollapse,
  onOpenWorkOrder,
  onPinDiscipline,
}: FocusOverlayProps): JSX.Element | null => {
  const cardRef = useRef<HTMLDivElement>(null)

  // Spec §9: "Focus enters the dialog on open" — the bay button that
  // opened this unmounts immediately (it was never a real modal trigger
  // handing off focus the way a native <dialog> would), so nothing moves
  // focus here on its own.
  useEffect(() => {
    cardRef.current?.querySelector("button")?.focus()
  }, [bay.id, expanded.mode])

  const center = cellCenter(bay.cellId)
  if (!center) return null

  const foWidth = CELL_WIDTH * FOCUS_WIDTH_SCALE
  const foHeight = CELL_HEIGHT * FOCUS_HEIGHT_SCALE
  const targetCenterX = center.x * (1 - FOCUS_PULL)
  const targetCenterY = center.y * (1 - FOCUS_PULL)

  const left = viewport.left + (targetCenterX - foWidth / 2) * viewport.scale
  const top = viewport.top + (targetCenterY - foHeight / 2) * viewport.scale
  const width = foWidth * viewport.scale
  const height = foHeight * viewport.scale
  const accent = DISCIPLINE_TOKENS[bay.discipline].accent

  return (
    <div
      className="site-focus-frame"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        ...cellAccentStyle(accent),
      }}
    >
      <div ref={cardRef} className="site-expanded-card">
        <FocusedBayContent
          bay={bay}
          mode={expanded.mode}
          onCollapse={onCollapse}
          onOpenWorkOrder={onOpenWorkOrder}
          onPinDiscipline={onPinDiscipline}
        />
      </div>
    </div>
  )
}
