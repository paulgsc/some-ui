import { buildEnforcementCSS } from "@filter/adapter/enforcement-sheet"
import { getSwatch, SWATCHES } from "@filter/adapter/swatches"
import { isExtensionMessage } from "@filter/lib/background/guard"
import {
  DEFAULT_LEGACY_STYLE,
  isLegacyStyle,
  LEGACY_PRESETS,
} from "@filter/lib/legacy-presets"
import { DEFAULT_TAB_STATE, nextTabState } from "@filter/lib/tab-state"
import { ext } from "@filter/platform/background"
import type { ExtensionMessage } from "@filter/types/message"
import type { FilterConfig, LegacyStyle } from "@filter/types/popup"
import type { TabState } from "@filter/types/tab"

const DEFAULT_FILTER: FilterConfig = LEGACY_PRESETS[DEFAULT_LEGACY_STYLE]

type StoredState = {
  filteredTabIds: Array<number>
  tabStates: Record<number, TabState>
  filterConfig: FilterConfig
  legacyStyle: LegacyStyle
}

function normalizeState(data: Partial<StoredState>): StoredState {
  return {
    filteredTabIds: Array.isArray(data.filteredTabIds)
      ? data.filteredTabIds
      : [],
    tabStates: data.tabStates ?? {},
    filterConfig: data.filterConfig ?? DEFAULT_FILTER,
    legacyStyle: isLegacyStyle(data.legacyStyle)
      ? data.legacyStyle
      : DEFAULT_LEGACY_STYLE,
  }
}

async function getState(): Promise<StoredState> {
  const data = await ext.storage.local.get([
    "filteredTabIds",
    "tabStates",
    "filterConfig",
    "legacyStyle",
  ])

  return normalizeState(data)
}

async function setTabState(tabId: number, state: TabState): Promise<void> {
  const stored = await getState()

  const tabStates: Record<number, TabState> = {
    ...stored.tabStates,
    [tabId]: state,
  }

  const filteredTabIds =
    state === "legacy"
      ? Array.from(new Set([...stored.filteredTabIds, tabId]))
      : stored.filteredTabIds.filter((id) => id !== tabId)

  await ext.storage.local.set({
    tabStates,
    filteredTabIds,
  })
}

async function sendToTab(tabId: number, msg: ExtensionMessage): Promise<void> {
  try {
    await ext.tabs.sendMessage(tabId, msg)
  } catch {
    // intentionally ignored
  }
}

// ─────────────────────────────────────────────
// legacy style (invert vs dim)
// ─────────────────────────────────────────────

const LEGACY_STYLE_MENU_PARENT_ID = "sw-legacy-style"
const LEGACY_STYLE_MENU_IDS: Record<LegacyStyle, string> = {
  invert: "sw-legacy-style-invert",
  dim: "sw-legacy-style-dim",
}
const MENU_ID_TO_LEGACY_STYLE: Record<string, LegacyStyle> = {
  [LEGACY_STYLE_MENU_IDS.invert]: "invert",
  [LEGACY_STYLE_MENU_IDS.dim]: "dim",
}

function syncLegacyStyleMenu(style: LegacyStyle): void {
  for (const [candidate, id] of Object.entries(LEGACY_STYLE_MENU_IDS)) {
    void ext.contextMenus
      .update(id, { checked: candidate === style })
      .catch(() => {
        // Menu may not exist yet (e.g. Chrome, which has no "tab" context and
        // may have failed to create these items) — nothing to reconcile.
      })
  }
}

/** Persist the chosen legacy style, push the new config to every tab
 * currently in "legacy" mode, and reflect the choice in the context menu. */
async function applyLegacyStyle(style: LegacyStyle): Promise<void> {
  const filterConfig = LEGACY_PRESETS[style]

  await ext.storage.local.set({ legacyStyle: style, filterConfig })
  syncLegacyStyleMenu(style)

  const { filteredTabIds } = await getState()
  await Promise.all(
    filteredTabIds.map((tabId) =>
      sendToTab(tabId, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config: filterConfig,
      })
    )
  )
}

// ─────────────────────────────────────────────
// diagnostics
// ─────────────────────────────────────────────

const OPEN_DIAGNOSTICS_MENU_ID = "sw-open-diagnostics"

/** Same destination as the popup's own "Diagnostics" footer link. */
function openDiagnostics(): void {
  void ext.tabs.create({ url: ext.runtime.getURL("debug.html") })
}

// ─────────────────────────────────────────────
// ADR 0002 enforcement sheet (behind a flag — §7 step 2)
// ─────────────────────────────────────────────
//
// `insertCSS({ origin: "USER" })` is only callable from an extension
// context (content scripts have no `scripting` API), hence here.
//
// `enforcementSheetEnabled` in storage.local, default absent; no UI toggle
// yet. With it on, auto mode is the sheet instead of the classifier (see
// content.ts). Flip it from the service worker's console
// (chrome://extensions → this extension → "service worker"):
//
//   chrome.storage.local.set({ enforcementSheetEnabled: true })
//
// Kept out of StoredState: that is the legacy-filter/tab-state concern.
const ENFORCEMENT_SHEET_STORAGE_KEY = "enforcementSheetEnabled"

async function isEnforcementSheetEnabled(): Promise<boolean> {
  const data = await ext.storage.local.get([ENFORCEMENT_SHEET_STORAGE_KEY])
  return data[ENFORCEMENT_SHEET_STORAGE_KEY] === true
}

// The sheet is requested per document by the content side
// (`lib/content/enforcement-handshake.ts`), the only thing that knows the
// tab's state, and injected into exactly the requesting frame. Injecting
// per tab regardless of state would put the canvas rule's `filter: none`
// over legacy's invert.
//
// No per-tab bookkeeping here: the content side owns idempotency (it asks
// only while a read shows the sheet absent, and removes until a read shows
// it gone), because two identical `insertCSS` calls stack two copies and a
// restarted worker would have lost any record of the first.

/** Built once per swatch: `removeCSS` needs the byte-identical string. A restarted worker rebuilds the same one, since `buildEnforcementCSS` is pure. */
const enforcementCss = new Map<string, string>()

function enforcementCssFor(swatchId: string): string | null {
  const cached = enforcementCss.get(swatchId)
  if (cached !== undefined) return cached
  if (!(swatchId in SWATCHES)) return null
  const css = buildEnforcementCSS(getSwatch(swatchId))
  enforcementCss.set(swatchId, css)
  return css
}

async function applyEnforcement(
  op: "insert" | "remove",
  swatchId: string,
  sender: { tab?: { id?: number }; frameId?: number }
): Promise<boolean> {
  const tabId = sender.tab?.id
  const css = enforcementCssFor(swatchId)
  if (tabId === undefined || css === null) return false
  const injection = {
    target: { tabId, frameIds: [sender.frameId ?? 0] },
    origin: "USER" as const,
    css,
  }
  try {
    await (op === "insert"
      ? ext.scripting.insertCSS(injection)
      : ext.scripting.removeCSS(injection))
    return true
  } catch {
    // Scripting-restricted origins (extension pages, the Web Store) reject
    // outright. The content side's read is the answer either way.
    return false
  }
}

// Frames. CSS never crosses a frame boundary, and the manifest's content
// scripts are top-frame only. While the flag is on, a dynamically registered
// `frame.js` runs at document_start in every subframe (it exits in the top
// frame), raises that frame's own veil, and requests the sheet for itself —
// which is what covers a frame created or navigated after load. Registered
// only while the flag is on, rather than as a manifest `all_frames` entry, so
// the default (flag-off) path puts no veil and no script into any iframe.
const FRAME_SCRIPT_ID = "sf-enforcement-frames"

// The definition every supported browser accepts.
const compatibleFrameScript = {
  id: FRAME_SCRIPT_ID,
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_start" as const,
  css: ["prepaint.css"],
  js: ["frame.js"],
}

// Plus `matchOriginAsFallback`, which also matches `about:blank`, `srcdoc`,
// `data:` and `blob:` frames by their creator's origin (a srcdoc iframe with
// a white background otherwise gets neither veil nor sheet). Each pays a veil
// and one round trip. The key needs Chromium 119+ / Firefox 128+ and is not
// in this package's typings (hence a variable); an older browser rejects the
// whole registration, so syncFrameScript() falls back to the compatible one.
const frameScript = { ...compatibleFrameScript, matchOriginAsFallback: true }

async function syncFrameScript(): Promise<void> {
  try {
    const enabled = await isEnforcementSheetEnabled()
    const registered = await ext.scripting.getRegisteredContentScripts({
      ids: [FRAME_SCRIPT_ID],
    })
    if (enabled && registered.length === 0) {
      try {
        await ext.scripting.registerContentScripts([frameScript])
      } catch {
        // Schema rejection on a browser without matchOriginAsFallback: every
        // http(s)/file frame is still covered, fallback-origin frames are not.
        await ext.scripting.registerContentScripts([compatibleFrameScript])
      }
    } else if (enabled) {
      // A compatible registration persists across a browser upgrade; upgrade
      // it in place when the key is missing. On a browser that still rejects
      // the key this fails and the compatible one stays.
      const current: unknown = registered[0]
      if (
        typeof current === "object" &&
        current !== null &&
        Reflect.get(current, "matchOriginAsFallback") !== true
      ) {
        try {
          await ext.scripting.updateContentScripts([frameScript])
        } catch {
          // Still unsupported here.
        }
      }
    } else if (registered.length > 0) {
      await ext.scripting.unregisterContentScripts({ ids: [FRAME_SCRIPT_ID] })
    }
  } catch {
    // A concurrent sync already (un)registered it — the next flag change or
    // worker start reconciles again.
  }
}

void syncFrameScript()
ext.storage.onChanged.addListener((changes, area): void => {
  if (area === "local" && ENFORCEMENT_SHEET_STORAGE_KEY in changes) {
    void syncFrameScript()
  }
})

// ─────────────────────────────────────────────
// install
// ─────────────────────────────────────────────

ext.runtime.onInstalled.addListener((): void => {
  void ext.storage.local.set({
    filteredTabIds: [],
    tabStates: {},
    filterConfig: DEFAULT_FILTER,
    legacyStyle: DEFAULT_LEGACY_STYLE,
  })

  // "tab" (right-click the tab strip) is Firefox-only; Chrome has no such
  // context and silently fails to create these items, which is fine — the
  // popup toggle covers Chrome.
  void ext.contextMenus.removeAll().then(() => {
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Legacy filter style",
      contexts: ["tab"],
    })
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_IDS.invert,
      parentId: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Invert colors",
      type: "radio",
      checked: DEFAULT_LEGACY_STYLE === "invert",
      contexts: ["tab"],
    })
    ext.contextMenus.create({
      id: LEGACY_STYLE_MENU_IDS.dim,
      parentId: LEGACY_STYLE_MENU_PARENT_ID,
      title: "Dim (pairs with browser dark theme)",
      type: "radio",
      checked: DEFAULT_LEGACY_STYLE === "dim",
      contexts: ["tab"],
    })
    ext.contextMenus.create({
      id: OPEN_DIAGNOSTICS_MENU_ID,
      title: "Open diagnostics",
      contexts: ["tab"],
    })
  })
})

ext.contextMenus.onClicked.addListener((info): void => {
  const style = MENU_ID_TO_LEGACY_STYLE[String(info.menuItemId)]

  if (style) {
    void applyLegacyStyle(style)
    return
  }

  if (info.menuItemId === OPEN_DIAGNOSTICS_MENU_ID) {
    openDiagnostics()
  }
})

// ─────────────────────────────────────────────
// message handling
// ─────────────────────────────────────────────

// The listener types model Firefox's promise-returning onMessage (no
// `sendResponse`). On Chromium `ext` is `chrome`, where only returning a
// bare `true` and calling `sendResponse` later works: returning the Promise
// was measured to deliver `undefined` in this build. Hence the explicit
// `sendResponse` below.
type SendResponse = (response: unknown) => void

ext.runtime.onMessage.addListener(
  (msg, sender, sendResponse: SendResponse): boolean | Promise<unknown> => {
    if (!isExtensionMessage(msg)) {
      return false
    }

    if (msg.type === "GET_TAB_FILTER_STATE") {
      const handler = async (): Promise<unknown> => {
        const tabId = sender.tab?.id
        if (!tabId) {
          return { enabled: false, config: DEFAULT_FILTER }
        }

        const { filteredTabIds, filterConfig, tabStates } = await getState()

        return {
          enabled: filteredTabIds.includes(tabId),
          config: filterConfig,
          tabState: tabStates[tabId] ?? DEFAULT_TAB_STATE,
        }
      }

      void handler().then(sendResponse)
      return true
    }

    if (msg.type === "ENSURE_ENFORCEMENT") {
      void applyEnforcement("insert", msg.swatchId, sender).then((applied) =>
        sendResponse({ applied })
      )
      return true
    }

    if (msg.type === "REMOVE_ENFORCEMENT") {
      void applyEnforcement("remove", msg.swatchId, sender).then((removed) =>
        sendResponse({ removed })
      )
      return true
    }

    if (msg.type === "SET_LEGACY_STYLE") {
      void applyLegacyStyle(msg.style)
      return false
    }

    if (msg.type === "SET_FILTERED_TABS" && Array.isArray(msg.ids)) {
      const handler = async (): Promise<void> => {
        const { filteredTabIds, filterConfig, tabStates } = await getState()

        const desired = new Set(msg.ids)
        const current = new Set(filteredTabIds)

        const nextTabStates: Record<number, TabState> = {
          ...tabStates,
        }

        const allTabs = new Set([
          ...Array.from(desired),
          ...Array.from(current),
        ])

        for (const tabId of allTabs) {
          nextTabStates[tabId] = desired.has(tabId)
            ? "legacy"
            : DEFAULT_TAB_STATE
        }

        await ext.storage.local.set({
          filteredTabIds: msg.ids,
          tabStates: nextTabStates,
        })

        const tabs = await ext.tabs.query({})

        const tasks: Array<Promise<unknown>> = []

        for (const t of tabs) {
          if (typeof t.id !== "number") continue

          const wasFiltered = current.has(t.id)
          const willFilter = desired.has(t.id)

          if (wasFiltered === willFilter) continue

          tasks.push(
            sendToTab(t.id, {
              type: "TOGGLE_FILTER",
              enabled: willFilter,
              config: filterConfig,
            })
          )
        }

        await Promise.all(tasks)
      }

      void handler()
      return true
    }

    return false
  }
)

// ─────────────────────────────────────────────
// keyboard shortcut
// ─────────────────────────────────────────────

ext.commands.onCommand.addListener((command): void => {
  if (command !== "toggle-filter") return

  void (async (): Promise<void> => {
    const [activeTab] = await ext.tabs.query({
      active: true,
      currentWindow: true,
    })

    if (!activeTab || typeof activeTab.id !== "number") return

    const { tabStates } = await getState()
    const current = tabStates[activeTab.id] ?? DEFAULT_TAB_STATE
    const next = nextTabState(current)

    await setTabState(activeTab.id, next)
    await sendToTab(activeTab.id, {
      type: "CYCLE_TAB_STATE",
    })
  })()
})

// ─────────────────────────────────────────────
// tab lifecycle
// ─────────────────────────────────────────────

ext.tabs.onUpdated.addListener((tabId, changeInfo): void => {
  if (changeInfo.status !== "complete") return

  void (async (): Promise<void> => {
    const { tabStates, filterConfig } = await getState()

    if (tabStates[tabId] === "legacy") {
      await sendToTab(tabId, {
        type: "TOGGLE_FILTER",
        enabled: true,
        config: filterConfig,
      })
    }
  })()
})

ext.tabs.onRemoved.addListener((tabId): void => {
  void (async (): Promise<void> => {
    const { filteredTabIds, tabStates } = await getState()

    const { [tabId]: _, ...remaining } = tabStates

    await ext.storage.local.set({
      filteredTabIds: filteredTabIds.filter((id) => id !== tabId),
      tabStates: remaining,
    })
  })()
})

export {}
