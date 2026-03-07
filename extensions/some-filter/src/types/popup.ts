

export type FilterConfig = {
  invert: number
  hueRotate: number
  sepia: number
  brightness: number
  contrast: number
}

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
  tabs: TabEntry[]
}

export type PopupState = {
  selectedTabIds: Set<number>
  filteredTabIds: Set<number>
  filterActive: boolean
  groups: WindowGroup[]
  statusFilter: string | null
  filterConfig: FilterConfig
}
