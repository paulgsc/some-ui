import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Discipline, SiteUiState, WorkBay } from "./types"

export type SiteUiActions = {
  /** Hover/focus entering a bay — transient, cleared by `clearInspection`. */
  inspect: (bayId: string) => void
  /** Hover/focus leaving a bay. A no-op while that bay owns `expanded`. */
  clearInspection: (bayId: string) => void
  /** Primary activation (click, Enter/Space) — opens the full work order. */
  openWorkOrder: (bayId: string, anchor: "click" | "keyboard") => void
  /** Secondary activation (right-click, Shift+F10) — opens site actions. */
  openActions: (bayId: string, anchor: "keyboard" | "contextmenu") => void
  /** Reverses whichever expansion is open; a no-op otherwise. */
  collapse: () => void
  /** Legend selection — pins a discipline until changed or cleared. */
  pinDiscipline: (discipline: Discipline) => void
  clearPinnedDiscipline: () => void
}

export type SiteUiSelectors = {
  /** The bay the inspection surface should currently describe, per the
   * fallback chain in spec §16: transient hover/focus, else the pinned
   * discipline's representative bay, else nothing. */
  inspectedBay: WorkBay | null
  /** Registers each bay button so `collapse` can return focus to it. */
  registerBayRef: (bayId: string) => (el: HTMLButtonElement | null) => void
}

function pickRepresentativeBay(
  bays: ReadonlyArray<WorkBay>,
  discipline: Discipline
): WorkBay | undefined {
  return bays.find((bay) => bay.discipline === discipline)
}

export function useSiteUiState(
  bays: ReadonlyArray<WorkBay>
): [SiteUiState, SiteUiActions, SiteUiSelectors] {
  const [state, setState] = useState<SiteUiState>({
    inspectedBayId: null,
    pinnedDiscipline: null,
    expanded: null,
  })

  const bayRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map())

  const registerBayRef = useCallback(
    (bayId: string): ((el: HTMLButtonElement | null) => void) =>
      (el) => {
        bayRefs.current.set(bayId, el)
      },
    []
  )

  // Focus return (spec §9's "closing restores focus to the originating
  // hex"): the bay that owned `expanded` renders a plain region while
  // focused, not a `<button>` (a focused cell's own sub-controls — close,
  // actions — can't nest inside one), so the button `collapse` needs to
  // focus doesn't exist again until *after* this state change re-renders
  // the cell back to its resting form. A `useEffect` firing post-commit,
  // rather than a synchronous `.focus()` inside the state updater, is what
  // makes that ordering safe.
  const pendingFocusReturnRef = useRef<string | null>(null)

  useEffect(() => {
    if (state.expanded) {
      pendingFocusReturnRef.current = state.expanded.bayId
      return
    }
    const bayId = pendingFocusReturnRef.current
    if (!bayId) return
    pendingFocusReturnRef.current = null
    const frame = requestAnimationFrame(() => {
      bayRefs.current.get(bayId)?.focus()
    })
    return (): void => cancelAnimationFrame(frame)
  }, [state.expanded])

  const inspect = useCallback((bayId: string) => {
    setState((prev) => ({ ...prev, inspectedBayId: bayId }))
  }, [])

  const clearInspection = useCallback((bayId: string) => {
    setState((prev) => {
      // Rule 2: an open expansion freezes the inspected bay until it closes.
      if (prev.expanded?.bayId === bayId) return prev
      if (prev.inspectedBayId !== bayId) return prev
      return { ...prev, inspectedBayId: null }
    })
  }, [])

  const openWorkOrder = useCallback(
    (bayId: string, anchor: "click" | "keyboard") => {
      setState((prev) => ({
        ...prev,
        inspectedBayId: bayId,
        expanded: { bayId, mode: "workorder", anchor },
      }))
    },
    []
  )

  const openActions = useCallback(
    (bayId: string, anchor: "keyboard" | "contextmenu") => {
      setState((prev) => ({
        ...prev,
        inspectedBayId: bayId,
        expanded: { bayId, mode: "actions", anchor },
      }))
    },
    []
  )

  const collapse = useCallback(() => {
    setState((prev) => (prev.expanded ? { ...prev, expanded: null } : prev))
  }, [])

  const pinDiscipline = useCallback((discipline: Discipline) => {
    setState((prev) => ({ ...prev, pinnedDiscipline: discipline }))
  }, [])

  const clearPinnedDiscipline = useCallback(() => {
    setState((prev) => ({ ...prev, pinnedDiscipline: null }))
  }, [])

  const inspectedBay = useMemo((): WorkBay | null => {
    if (state.inspectedBayId) {
      return bays.find((bay) => bay.id === state.inspectedBayId) ?? null
    }
    if (state.pinnedDiscipline) {
      return pickRepresentativeBay(bays, state.pinnedDiscipline) ?? null
    }
    return null
  }, [bays, state.inspectedBayId, state.pinnedDiscipline])

  const actions: SiteUiActions = {
    inspect,
    clearInspection,
    openWorkOrder,
    openActions,
    collapse,
    pinDiscipline,
    clearPinnedDiscipline,
  }

  const selectors: SiteUiSelectors = {
    inspectedBay,
    registerBayRef,
  }

  return [state, actions, selectors]
}
