import { vi } from "vitest"

const mockTabsApi = {
  discard: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  reload: vi.fn(),
  // remove is mocked so the never-close invariant can be asserted (call count 0)
  remove: vi.fn(),
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
  session: { get: vi.fn(), set: vi.fn() },
  onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
}

const mockRuntimeApi = {
  onInstalled: { addListener: vi.fn() },
  onStartup: { addListener: vi.fn() },
  onMessage: { addListener: vi.fn() },
  onMessageExternal: { addListener: vi.fn() },
  sendMessage: vi.fn(),
  getURL: (path: string): string => `moz-extension://testid/${path}`,
  getManifest: (): { name: string; version: string } => ({
    name: "Suspender Ledger",
    version: "0.1.0",
  }),
}

const mockIdleApi = {
  setDetectionInterval: vi.fn(),
  queryState: vi.fn(),
  onStateChanged: { addListener: vi.fn() },
}

const mockMenusApi = {
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  onClicked: { addListener: vi.fn() },
}

const mockScriptingApi = {
  executeScript: vi.fn(),
}

const mockActionApi = {
  setTitle: vi.fn(),
  setIcon: vi.fn(),
  setPopup: vi.fn(),
  setBadgeText: vi.fn(),
  setBadgeBackgroundColor: vi.fn(),
}

vi.stubGlobal("chrome", {
  tabs: mockTabsApi,
  alarms: mockAlarmsApi,
  storage: mockStorageApi,
  runtime: mockRuntimeApi,
  idle: mockIdleApi,
  contextMenus: mockMenusApi,
  scripting: mockScriptingApi,
  action: mockActionApi,
})

vi.stubGlobal("browser", {
  tabs: mockTabsApi,
  alarms: mockAlarmsApi,
  storage: mockStorageApi,
  runtime: mockRuntimeApi,
  idle: mockIdleApi,
  menus: mockMenusApi,
  scripting: mockScriptingApi,
  action: mockActionApi,
})
