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
import { DiscardBanner } from "@suspender/popup/components/discard-banner"
import {
  SettingsForm,
  type SettingsValues,
  type ShortcutHint,
} from "@suspender/popup/components/settings-form"
import { TabStatus } from "@suspender/popup/components/tab-status"
import { settleEach } from "@suspender/popup/hydrate"
import { READ_FAILED, SECTION_FAILED } from "@suspender/popup/words"
import {
  POPUP_SECTIONS,
  type PopupCommand,
  type PopupRead,
  type PopupSection,
  type PopupToWorkerMessage,
} from "@suspender/types/messages"
import {
  DISCARD_STATE_STORAGE_KEY,
  summarizeSkipReasons,
} from "@suspender/worker/core/discard-state"
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

// eslint-disable-next-line one-owner/no-local-primitive -- not moved to @some-extension/common yet (#2112)
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

/**
 * Reads the "kept awake" snapshot straight out of `storage.session` — the
 * same direct-storage-read convention `readPrefs` above uses for
 * `storage.local`, rather than round-tripping through the worker. The popup
 * and the worker are separate execution contexts (this is a fresh page load
 * every time the toolbar icon is clicked), so this is deliberately re-read on
 * every open: it reports on whatever is currently true, not what was true
 * the last time this exact tab's popup happened to be open.
 */
async function readDiscardReasons(): Promise<Array<string>> {
  const raw: unknown = await browser.storage.session.get(
    DISCARD_STATE_STORAGE_KEY
  )
  if (!isRecord(raw)) {
    return []
  }
  const stored = raw[DISCARD_STATE_STORAGE_KEY]
  return summarizeSkipReasons(isRecord(stored) ? stored : {})
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
  /** Deduplicated, plain-language reasons some background tab(s) could not be suspended — see `readDiscardReasons`. */
  discardReasons: Array<string>
  /** The reads whose last try failed, named in the popup. */
  failedReads: ReadonlyArray<PopupRead>
}

const NO_TAB: ActiveTab = {
  title: "",
  discarded: false,
  autoSuspendable: true,
}

let state: PopupState = {
  tab: NO_TAB,
  prefs: { ...PREF_DEFAULTS },
  shortcuts: [],
  discardReasons: [],
  failedReads: [],
}

/** What this open of the popup already told the worker about. */
const reportedReads = new Set<PopupRead>()
const reportedSections = new Set<PopupSection>()

const unseen = <T>(names: ReadonlyArray<T>, seen: Set<T>): Array<T> => {
  const fresh = names.filter((name) => !seen.has(name))
  for (const name of fresh) seen.add(name)
  return fresh
}

/** Tells the worker, once per open, what couldn't be read or shown. */
function reportTrouble(
  reads: ReadonlyArray<PopupRead>,
  sections: ReadonlyArray<PopupSection>
): void {
  const newReads = unseen(reads, reportedReads)
  const newSections = unseen(sections, reportedSections)
  if (newReads.length === 0 && newSections.length === 0) return
  const report: PopupToWorkerMessage = {
    method: "popup-trouble",
    reads: newReads,
    sections: newSections,
  }
  browser.runtime.sendMessage(report).catch(() => {
    // Ignored: the popup has already said what it couldn't read; a worker
    // that missed the note keeps the rest of its Diagnostics log.
  })
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
  void browser.storage.local.set(stored).then(() => refresh(AFTER_A_CHANGE))
}

/**
 * Writes `edit` of the whitelist as stored, read afresh: the one on screen may
 * be the default after a failed read, and writing an edit of that would
 * drop every saved rule. When the read fails again, nothing is written and the
 * popup goes on saying it couldn't read your settings.
 */
async function editWhitelist(
  edit: (rules: Array<string>) => Array<string>
): Promise<void> {
  let stored: PopupPrefKeys
  try {
    stored = await readPrefs()
  } catch {
    // Ignored: nothing is written, and the popup says it couldn't read your
    // settings.
    if (!state.failedReads.includes("settings")) {
      setState({ failedReads: [...state.failedReads, "settings"] })
    }
    return
  }
  await browser.storage.local.set({ whitelist: edit(stored.whitelist) })
  await refresh(AFTER_A_CHANGE)
}

function onWhitelistAdd(rule: string): void {
  void editWhitelist((rules) =>
    [...rules, rule].filter((r, i, l) => l.indexOf(r) === i)
  )
}

function onWhitelistRemove(rule: string): void {
  void editWhitelist((rules) => rules.filter((r) => r !== rule))
}

// ── Render ────────────────────────────────────────────────────────────────────

/** Each section, built on its own so one that throws costs only itself. */
const SECTIONS: Readonly<Record<PopupSection, () => HTMLElement>> = {
  "kept-awake-banner": () => DiscardBanner({ reasons: state.discardReasons }),
  "tab-status": () =>
    TabStatus({
      title: state.tab.title,
      favIconUrl: state.tab.favIconUrl,
      state: state.tab.discarded ? "suspended" : "active",
      whitelisted: isWhitelisted(),
    }),
  actions: () =>
    ActionMenu({
      whitelisted: isWhitelisted(),
      autoSuspendable: state.tab.autoSuspendable,
      onCommand,
    }),
  settings: () =>
    SettingsForm({
      values: settingsValues(),
      shortcuts: state.shortcuts,
      onChange: onSettingsChange,
      onWhitelistAdd,
      onWhitelistRemove,
    }),
  diagnostics: diagnosticsLink,
}

function render(): void {
  const root = document.getElementById("app")
  if (!root) return
  root.replaceChildren()

  const built: Array<HTMLElement> = []
  const failedSections: Array<PopupSection> = []
  for (const name of POPUP_SECTIONS) {
    try {
      built.push(SECTIONS[name]())
    } catch {
      failedSections.push(name)
    }
  }
  const lines = [
    ...state.failedReads.map((read) => READ_FAILED[read]),
    ...failedSections.map((name) => SECTION_FAILED[name]),
  ]
  if (lines.length > 0) root.appendChild(troubleNotice(lines))
  root.append(...built)
  reportTrouble(state.failedReads, failedSections)
}

/** What couldn't be read or shown, one line each, above the rest. */
function troubleNotice(lines: ReadonlyArray<string>): HTMLElement {
  const notice = document.createElement("div")
  notice.className = "popup__trouble"
  notice.setAttribute("role", "status")
  for (const line of lines) {
    const p = document.createElement("p")
    p.textContent = line
    notice.appendChild(p)
  }
  return notice
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
    return NO_TAB
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

type Reads = {
  tab: ActiveTab
  settings: PopupPrefKeys
  shortcuts: Array<ShortcutHint>
  "kept-awake": Array<string>
}

const EVERYTHING: Readonly<Record<keyof Reads, true>> = {
  tab: true,
  settings: true,
  shortcuts: true,
  "kept-awake": true,
}

/** What a settings change can move: the tab's whitelisting and the settings. */
const AFTER_A_CHANGE: Partial<Record<keyof Reads, true>> = {
  tab: true,
  settings: true,
}

/**
 * Reads what `which` names, each read on its own (SLP1, `__tests__/index.test.ts`):
 * one that fails leaves what's on screen, the default on opening, and is named
 * until it next answers.
 */
async function refresh(
  which: Partial<Record<keyof Reads, true>> = EVERYTHING
): Promise<void> {
  const { answered, failed } = await settleEach<Reads>({
    tab: which.tab && readActiveTab,
    settings: which.settings && readPrefs,
    shortcuts: which.shortcuts && readShortcuts,
    "kept-awake": which["kept-awake"] && readDiscardReasons,
  })
  setState({
    ...(answered.tab && { tab: answered.tab }),
    ...(answered.settings && { prefs: answered.settings }),
    ...(answered.shortcuts && { shortcuts: answered.shortcuts }),
    ...(answered["kept-awake"] && { discardReasons: answered["kept-awake"] }),
    failedReads: [
      ...state.failedReads.filter((read) => which[read] !== true),
      ...failed,
    ],
  })
}

void refresh()
