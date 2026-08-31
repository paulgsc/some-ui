import { useCallback, useEffect, useMemo, useRef, type JSX } from "react"
import { HexGrid } from "@some-ui/honeycomb"

import { neighborIdsOf } from "@/lib/site-honeycomb/cube-coord"
import { deriveSiteSummary, EMPTY_CELL_IDS } from "@/lib/site-honeycomb/data"
import { HEX_SIZE } from "@/lib/site-honeycomb/hex-pixel"
import type { Discipline, WorkBay } from "@/lib/site-honeycomb/types"
import { useSiteUiState } from "@/lib/site-honeycomb/use-site-ui-state"
import { useSvgViewport } from "@/lib/site-honeycomb/use-svg-viewport"

import { DisciplineLegend } from "./discipline-legend"
import { FocusOverlay } from "./focus-overlay"
import { InspectionStrip } from "./inspection-strip"
import type { SiteCellPayload } from "./site-hex-cell"
import { renderSiteHexCell } from "./site-hex-cell"
import { SummaryCluster } from "./summary-cluster"

import "./site-honeycomb.css"

type SiteHoneycombProps = {
  bays: ReadonlyArray<WorkBay>
}

const MIN_HEX_SIZE = 26

export const SiteHoneycomb = ({ bays }: SiteHoneycombProps): JSX.Element => {
  const [state, actions, { inspectedBay, registerBayRef }] =
    useSiteUiState(bays)
  const summary = useMemo(() => deriveSiteSummary(bays), [bays])
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const viewport = useSvgViewport(gridWrapperRef)

  const focusedBay = state.expanded
    ? (bays.find((bay) => bay.id === state.expanded?.bayId) ?? null)
    : null

  // The bay currently exerting "local excitation" on its neighbors — the
  // focused bay while one is expanded, else whatever's merely inspected
  // (gap report §3.2/§3.3: hover perturbs the field, activation owns it).
  const activeBay = focusedBay ?? inspectedBay

  const yieldingCellIds = useMemo(() => {
    if (!activeBay) return new Set<string>()
    return new Set(neighborIdsOf(activeBay.cellId))
  }, [activeBay])

  const onOpenWorkOrderById = useCallback(
    (bay: WorkBay) => {
      actions.openWorkOrder(bay.id, "click")
    },
    [actions]
  )

  const cellContent = useMemo(
    () => [
      ...Array.from(EMPTY_CELL_IDS, (cellId) => ({
        id: cellId,
        content: {
          theme: { fill: "none", opacity: 1 },
          data: { kind: "empty" as const },
        },
      })),
      ...bays.map((bay) => {
        const isFocused = state.expanded?.bayId === bay.id
        const isInspected = inspectedBay?.id === bay.id
        const isYielding = !isFocused && yieldingCellIds.has(bay.cellId)
        const isReceding = Boolean(state.expanded) && !isFocused && !isYielding

        const payload: SiteCellPayload = {
          kind: "bay",
          bay,
          isInspected,
          isFocused,
          isReceding,
          isYielding,
          onEnter: (b) => actions.inspect(b.id),
          onLeave: (b) => actions.clearInspection(b.id),
          onOpenWorkOrder: onOpenWorkOrderById,
          onOpenActions: (b) => actions.openActions(b.id, "contextmenu"),
          registerRef: (b) => registerBayRef(b.id),
        }

        return {
          id: bay.cellId,
          content: {
            theme: {
              fill: "oklch(0.24 0.016 260)",
              stroke: "oklch(0.34 0.02 260)",
              strokeWidth: 1,
              opacity: 1,
            },
            data: payload,
          },
        }
      }),
    ],
    [
      bays,
      state.expanded,
      inspectedBay,
      registerBayRef,
      yieldingCellIds,
      actions,
      onOpenWorkOrderById,
    ]
  )

  const inspectedForStrip = focusedBay ?? inspectedBay

  const handleLegendSelect = (discipline: Discipline): void => {
    if (state.pinnedDiscipline === discipline) {
      actions.clearPinnedDiscipline()
    } else {
      actions.pinDiscipline(discipline)
    }
  }

  const isExpanded = Boolean(state.expanded)
  useEffect(() => {
    if (!isExpanded) return
    // A document listener, not `onKeyDown` on a container: the bay button
    // that opened this unmounts as part of the same click that opens it
    // (see focus-overlay.tsx), which can drop focus out of any React tree
    // this component owns before the keypress that should close it fires.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        actions.collapse()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return (): void => document.removeEventListener("keydown", onKeyDown)
  }, [isExpanded, actions])

  return (
    <div className="site-honeycomb">
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <SummaryCluster summary={summary} />
      </div>

      <div ref={gridWrapperRef} style={{ position: "relative", height: 560 }}>
        <HexGrid<SiteCellPayload>
          cellCount={19}
          hexSize={HEX_SIZE}
          minHexSize={MIN_HEX_SIZE}
          viewBoxFactor={1.35}
          backgroundOpacity={0.12}
          fitStrategy="shrink-only"
          cellContent={cellContent}
          renderCell={renderSiteHexCell}
        />
        {state.expanded && focusedBay && viewport && (
          <FocusOverlay
            expanded={state.expanded}
            bay={focusedBay}
            viewport={viewport}
            onCollapse={actions.collapse}
            onOpenWorkOrder={onOpenWorkOrderById}
            onPinDiscipline={actions.pinDiscipline}
          />
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <InspectionStrip bay={inspectedForStrip} />
      </div>

      <div style={{ marginTop: 24 }}>
        <DisciplineLegend
          pinned={state.pinnedDiscipline}
          onSelect={handleLegendSelect}
        />
      </div>
    </div>
  )
}
