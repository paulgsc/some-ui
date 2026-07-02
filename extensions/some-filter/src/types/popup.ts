export type FilterConfig = {
  invert: number
  hueRotate: number
  sepia: number
  brightness: number
  contrast: number
}

/**
 * How the "legacy" filter renders:
 *   - "invert"  — global colour inversion (the original behaviour).
 *   - "dim"     — brightness/contrast only, no inversion. Meant to pair with
 *                 the browser's native dark theme: inverting would flip an
 *                 already-dark background back to light, whereas scaling
 *                 brightness down mostly affects the (already-bright) text,
 *                 since a near-black background barely changes under the
 *                 same multiplier.
 */
export type LegacyStyle = "invert" | "dim"

export type TabEntry = {
  id: number
  windowId: number
  title: string
  url: string
  favIconUrl: string
  active: boolean
  audible: boolean
  pinned: boolean
  status: string
}

export type WindowGroup = {
  windowId: number
  windowIndex: number
  tabs: Array<TabEntry>
}

export type PopupState = {
  selectedTabIds: Set<number>
  filteredTabIds: Set<number>
  filterActive: boolean
  groups: Array<WindowGroup>
  statusFilter: string | null
  filterConfig: FilterConfig
  legacyStyle: LegacyStyle
}
