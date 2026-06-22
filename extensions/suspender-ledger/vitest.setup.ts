import { vi } from "vitest"

const mockTabsApi = {
  discard: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
  onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
}

const mockAlarmsApi = {
  create: vi.fn(),
  clear: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
}

const mockStorageApi = {
  local: { get: vi.fn(), set: vi.fn() },
  sync: { get: vi.fn(), set: vi.fn() },
}

const mockRuntimeApi = {
  onInstalled: { addListener: vi.fn() },
  onMessage: { addListener: vi.fn() },
  getURL: (path: string): string => `moz-extension://testid/${path}`,
}

const mockIdleApi = {
  setDetectionInterval: vi.fn(),
  onStateChanged: { addListener: vi.fn() },
}

const mockMenusApi = {
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  onClicked: { addListener: vi.fn() },
}

vi.stubGlobal("chrome", {
  tabs: mockTabsApi,
  alarms: mockAlarmsApi,
  storage: mockStorageApi,
  runtime: mockRuntimeApi,
  idle: mockIdleApi,
  contextMenus: mockMenusApi,
})

vi.stubGlobal("browser", {
  tabs: mockTabsApi,
  alarms: mockAlarmsApi,
  storage: mockStorageApi,
  runtime: mockRuntimeApi,
  idle: mockIdleApi,
  menus: mockMenusApi,
})
