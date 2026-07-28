// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Adapted from auto-tab-discard v3/data/popup + v3/data/options (MPL-2.0)
// Copyright (C) auto-tab-discard contributors
//
// Popup controller: hydrates the active-tab status, the action grid, and the
// embedded settings form, then bridges UI intent onto the worker message
// protocol (`PopupToWorkerMessage`) and `storage.local`.

import { ActionMenu } from "@suspender/popup/components/action-menu"
import {
  SettingsForm,
  type SettingsValues,
  type ShortcutHint,
} from "@suspender/popup/components/settings-form"
import {
  TabStatus,
  type TabState,
} from "@suspender/popup/components/tab-status"
import type {
  PopupCommand,
  PopupToWorkerMessage,
} from "@suspender/types/messages"
import type { Prefs } from "@suspender/worker/core/prefs"

import "./popup.css"

// ── Preference bridge ─────────────────────────────────────────────────────────
//
// Only the keys the popup reads/writes are modelled here; defaults mirror the
// worker's `prefs.ts`. The form works in minutes for the human-facing fields and
// converts to the worker's seconds on persist.

type PopupPrefKeys = Pick<
  Prefs,
  | "whitelist"
  | "idle-timeout"
  | "period"
  | "number"
  | "favicon"
  | "prepends"
  | "pinned"
>

const PREF_DEFAULTS: PopupPrefKeys = {
  whitelist: [],
  "idle-timeout": 5 * 60,
  period: 10 * 60,
  number: 6,
  favicon: false,
  prepends: "💤",
  pinned: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function readPrefs(): Promise<PopupPrefKeys> {
  const raw: unknown = await browser.storage.local.get(PREF_DEFAULTS)
  if (!isRecord(raw)) {
    return { ...PREF_DEFAULTS }
  }
  const whitelist = Array.isArray(raw.whitelist)
    ? raw.whitelist.filter((r): r is string => typeof r === "string")
    : PREF_DEFAULTS.whitelist
  const num = (key: keyof PopupPrefKeys, fallback: number): number =>
    typeof raw[key] === "number" ? raw[key] : fallback
  const bool = (key: keyof PopupPrefKeys, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? raw[key] : fallback
  return {
    whitelist,
    "idle-timeout": num("idle-timeout", PREF_DEFAULTS["idle-timeout"]),
    period: num("period", PREF_DEFAULTS.period),
    number: num("number", PREF_DEFAULTS.number),
    favicon: bool("favicon", PREF_DEFAULTS.favicon),
    prepends:
      typeof raw.prepends === "string" ? raw.prepends : PREF_DEFAULTS.prepends,
    pinned: bool("pinned", PREF_DEFAULTS.pinned),
  }
}

/** Local mirror of the worker's whitelist matcher (kept dependency-free). */
function matchesWhitelist(
  rules: Array<string>,
  hostname: string,
  href: string
): boolean {
  if (rules.filter((s) => !s.startsWith("re:")).includes(hostname)) {
    return true
  }
  return rules
    .filter((s) => s.startsWith("re:"))
    .map((s) => s.slice(3))
    .some((s) => {
      try {
        return new RegExp(s).test(href)
      } catch {
        return false
      }
    })
}

function send(message: PopupToWorkerMessage): void {
  void browser.runtime.sendMessage(message)
}

// ── State ─────────────────────────────────────────────────────────────────────

type ActiveTab = {
  id?: number
  title: string
  favIconUrl?: string
  url?: string
  discarded: boolean
  autoSuspendable: boolean
}

type PopupState = {
  tab: ActiveTab
  prefs: PopupPrefKeys
  shortcuts: Array<ShortcutHint>
}

let state: PopupState = {
  tab: {
    title: "",
    discarded: false,
    autoSuspendable: true,
  },
  prefs: { ...PREF_DEFAULTS },
  shortcuts: [],
}

function setState(patch: Partial<PopupState>): void {
  state = { ...state, ...patch }
  render()
}

function currentHost(): string {
  if (!state.tab.url) return ""
  try {
    return new URL(state.tab.url).hostname
  } catch {
    return ""
  }
}

function isWhitelisted(): boolean {
  const host = currentHost()
  if (!host) return false
  return matchesWhitelist(state.prefs.whitelist, host, state.tab.url ?? "")
}

function settingsValues(): SettingsValues {
  return {
    idleTimeoutMinutes: Math.max(
      1,
      Math.round(state.prefs["idle-timeout"] / 60)
    ),
    discardPeriodMinutes: Math.max(0, Math.round(state.prefs.period / 60)),
    minTabs: state.prefs.number,
    showFavicon: state.prefs.favicon,
    prepend: state.prefs.prepends,
    suspendPinned: state.prefs.pinned,
    whitelist: state.prefs.whitelist,
  }
}

// ── Intent handlers ───────────────────────────────────────────────────────────

/** Suspend/navigation commands close the popup; toggles keep it open. */
const CLOSING_COMMANDS = new Set<PopupCommand>([
  "discard-tab",
  "discard-tree",
  "discard-tabs",
  "discard-window",
  "discard-other-windows",
])

function onCommand(
  cmd: PopupCommand,
  opts: { shiftKey?: boolean; checked?: boolean; value?: boolean } = {}
): void {
  send({ method: "popup", cmd, ...opts })

  if (CLOSING_COMMANDS.has(cmd)) {
    window.close()
    return
  }

  // The worker persists toggle state asynchronously and sends no reply, so
  // re-reading storage here would race the write. Reflect the user's intent
  // optimistically instead — the worker converges on the same value.
  if (cmd === "whitelist-domain") {
    const host = currentHost()
    if (host) {
      const whitelist =
        opts.checked === false
          ? state.prefs.whitelist.filter((r) => r !== host)
          : [...state.prefs.whitelist, host].filter(
              (r, i, l) => l.indexOf(r) === i
            )
      setState({ prefs: { ...state.prefs, whitelist } })
    }
  } else if (cmd === "auto-discardable") {
    setState({ tab: { ...state.tab, autoSuspendable: opts.value === true } })
  }
}

function onSettingsChange(patch: Partial<SettingsValues>): void {
  const stored: Partial<Prefs> = {}
  if (patch.idleTimeoutMinutes !== undefined) {
    stored["idle-timeout"] = patch.idleTimeoutMinutes * 60
  }
  if (patch.discardPeriodMinutes !== undefined) {
    stored.period = patch.discardPeriodMinutes * 60
  }
  if (patch.minTabs !== undefined) {
    stored.number = patch.minTabs
  }
  if (patch.showFavicon !== undefined) {
    stored.favicon = patch.showFavicon
  }
  if (patch.prepend !== undefined) {
    stored.prepends = patch.prepend
  }
  if (patch.suspendPinned !== undefined) {
    stored.pinned = patch.suspendPinned
  }
  void browser.storage.local.set(stored).then(() => refresh())
}

function onWhitelistAdd(rule: string): void {
  const next = [...state.prefs.whitelist, rule].filter(
    (r, i, l) => l.indexOf(r) === i
  )
  void browser.storage.local.set({ whitelist: next }).then(() => refresh())
}

function onWhitelistRemove(rule: string): void {
  const next = state.prefs.whitelist.filter((r) => r !== rule)
  void browser.storage.local.set({ whitelist: next }).then(() => refresh())
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(): void {
  const root = document.getElementById("app")
  if (!root) return
  root.replaceChildren()

  const state2: TabState = state.tab.discarded ? "suspended" : "active"

  root.appendChild(
    TabStatus({
      title: state.tab.title,
      favIconUrl: state.tab.favIconUrl,
      state: state2,
      whitelisted: isWhitelisted(),
    })
  )

  root.appendChild(
    ActionMenu({
      whitelisted: isWhitelisted(),
      autoSuspendable: state.tab.autoSuspendable,
      onCommand,
    })
  )

  root.appendChild(
    SettingsForm({
      values: settingsValues(),
      shortcuts: state.shortcuts,
      onChange: onSettingsChange,
      onWhitelistAdd,
      onWhitelistRemove,
    })
  )

  root.appendChild(diagnosticsLink())
}

/**
 * Entry point to `debug.html`.
 *
 * Deliberately just a link: the popup must stay fast to open, and rendering a
 * health summary here would mean a message round trip to the worker on every
 * open. The page it opens computes health on demand instead.
 */
function diagnosticsLink(): HTMLElement {
  const footer = document.createElement("footer")
  footer.className = "popup__footer"

  const link = document.createElement("a")
  link.className = "popup__diagnostics"
  link.href = browser.runtime.getURL("debug.html")
  link.target = "_blank"
  link.rel = "noopener"
  link.textContent = "Diagnostics"
  link.title = "Health, metrics and the suspend event timeline"

  footer.appendChild(link)
  return footer
}

// ── Hydration ─────────────────────────────────────────────────────────────────

async function readActiveTab(): Promise<ActiveTab> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (!tab) {
    return { title: "", discarded: false, autoSuspendable: true }
  }
  return {
    id: tab.id,
    title: tab.title ?? "",
    favIconUrl: tab.favIconUrl,
    url: tab.url,
    discarded: tab.discarded === true,
    autoSuspendable: tab.autoDiscardable !== false,
  }
}

async function readShortcuts(): Promise<Array<ShortcutHint>> {
  const cmds = await browser.commands.getAll()
  return cmds
    .filter((c) => c.description)
    .map((c) => ({
      description: c.description ?? "",
      shortcut: c.shortcut ?? "",
    }))
}

async function refresh(): Promise<void> {
  const [tab, prefs] = await Promise.all([readActiveTab(), readPrefs()])
  setState({ tab, prefs })
}

void (async () => {
  try {
    const [tab, prefs, shortcuts] = await Promise.all([
      readActiveTab(),
      readPrefs(),
      readShortcuts(),
    ])
    setState({ tab, prefs, shortcuts })
  } catch {
    // Popup hydration is best-effort; a failure leaves the default shell.
  }
})()
