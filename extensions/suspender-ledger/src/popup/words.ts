// Copyright (c) 2026 paulgsc — MIT License
//
// The popup's words for what it couldn't read or show, in the person's terms:
// what is missing, never an API or an error's name. `__tests__/words.test.ts`
// holds that.

import type { PopupRead, PopupSection } from "@suspender/types/messages"

/** What the popup says when a read fails, on opening or after a change. */
export const READ_FAILED: Readonly<Record<PopupRead, string>> = {
  tab: "Couldn't read this tab, so its status may be wrong.",
  settings:
    "Couldn't read your settings, so what shows may not be what's saved.",
  shortcuts: "Couldn't read your keyboard shortcuts.",
  "kept-awake": "Couldn't check which tabs Firefox kept awake.",
}

/** What the popup says when a section fails to show. */
export const SECTION_FAILED: Readonly<Record<PopupSection, string>> = {
  "kept-awake-banner": "Couldn't show which tabs Firefox kept awake.",
  "tab-status": "Couldn't show this tab's status.",
  actions: "Couldn't show the suspend buttons.",
  settings: "Couldn't show your settings.",
  diagnostics: "Couldn't show the link to Diagnostics.",
}
