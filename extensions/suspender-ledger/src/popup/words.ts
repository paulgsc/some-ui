// Copyright (c) 2026 paulgsc — MIT License
//
// Tier-0: the popup's words for what it couldn't read or show, in the
// person's terms: what is missing and what shows instead, never an API or an
// error's name. `__tests__/words.test.ts` holds that.

import type { PopupRead } from "@suspender/popup/hydrate"

/** A section of the popup, as `render` builds them. */
export type PopupSection =
  | "kept-awake"
  | "tab-status"
  | "actions"
  | "settings"
  | "diagnostics"

/** What the popup says when a read fails. */
export const READ_FAILED: Readonly<Record<PopupRead, string>> = {
  tab: "Couldn't read this tab, so its status may be wrong.",
  settings: "Couldn't read your settings, so showing the defaults.",
  shortcuts: "Couldn't read your keyboard shortcuts, so none are listed.",
  "kept-awake": "Couldn't check which tabs Firefox kept awake.",
}

/** What the popup says when a section fails to show. */
export const SECTION_FAILED: Readonly<Record<PopupSection, string>> = {
  "kept-awake": "Couldn't show which tabs Firefox kept awake.",
  "tab-status": "Couldn't show this tab's status.",
  actions: "Couldn't show the suspend buttons.",
  settings: "Couldn't show your settings.",
  diagnostics: "Couldn't show the link to Diagnostics.",
}
