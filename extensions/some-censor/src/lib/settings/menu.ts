/**
 * The tab and toolbar-button menu (#1966), as data: which items it shows
 * for the stored settings, and what a click on one asks for. The background
 * builds it from {@link menuItems} on every change, so a check mark is
 * always what is stored, and hands each click to {@link menuCommand}.
 *
 * The age is not here on purpose: lowering it is never one right-click
 * away (the doctrine's §9 falsifier).
 */

import type { Mode, Settings } from "./settings"
import { MODES } from "./settings"
import { MENU_WORDS, MODE_WORDS } from "./words"

/** "bc" namespaces the items, as `debug.css`'s `bc-` prefix does. */
const ID = {
  on: "bc-on",
  mode: "bc-mode",
  autoplay: "bc-autoplay-stops",
  settings: "bc-settings",
} as const

const modeId = (mode: Mode): string => `${ID.mode}-${mode}`

export type MenuItem = {
  readonly id: string
  readonly title?: string
  readonly type?: "checkbox" | "radio" | "separator"
  readonly checked?: boolean
  readonly parentId?: string
}

/** Every item, in order, for `settings`; `diagnostics` is commons' item. */
export function menuItems(
  settings: Settings,
  diagnostics: { readonly id: string; readonly title: string }
): ReadonlyArray<MenuItem> {
  return [
    {
      id: ID.on,
      title: MENU_WORDS.on,
      type: "checkbox",
      checked: settings.enabled,
    },
    { id: `${ID.on}-separator`, type: "separator" },
    { id: ID.mode, title: MENU_WORDS.mode },
    ...MODES.map(
      (mode): MenuItem => ({
        id: modeId(mode),
        parentId: ID.mode,
        title: MODE_WORDS[mode].name,
        type: "radio",
        checked: settings.mode === mode,
      })
    ),
    {
      id: ID.autoplay,
      title: MENU_WORDS.autoplayStops,
      type: "checkbox",
      checked: settings.autoplay === "stop",
    },
    { id: `${ID.autoplay}-separator`, type: "separator" },
    { id: ID.settings, title: MENU_WORDS.settings },
    diagnostics,
  ]
}

export type MenuCommand =
  | {
      readonly kind: "change"
      readonly change: (stored: Settings) => Settings
    }
  | { readonly kind: "settings" }
  | { readonly kind: "diagnostics" }

/**
 * What a click on `id` asks for. A checkbox's `checked` is its state after
 * the click; anything not this menu's is null.
 */
export function menuCommand(
  id: string,
  checked: boolean | undefined,
  diagnosticsId: string
): MenuCommand | null {
  if (id === ID.on && checked !== undefined) {
    return { kind: "change", change: (s) => ({ ...s, enabled: checked }) }
  }
  if (id === ID.autoplay && checked !== undefined) {
    const autoplay = checked ? "stop" : "skip"
    return { kind: "change", change: (s) => ({ ...s, autoplay }) }
  }
  const mode = MODES.find((m) => modeId(m) === id)
  if (mode !== undefined) {
    return { kind: "change", change: (s) => ({ ...s, mode }) }
  }
  if (id === ID.settings) return { kind: "settings" }
  if (id === diagnosticsId) return { kind: "diagnostics" }
  return null
}
