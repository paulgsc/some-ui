/**
 * The theme picker's icons (C1184): the very marks the app's own theme
 * switcher shows (components/theme-switcher.tsx), lucide's Palette on its
 * button and Monitor beside "System", drawn as plain SVG where the site is
 * built, so the picker needs no script, at the app's sizes (size-5 and
 * size-4: 20 and 16 pixels).
 */
import { createElement } from "react"
import { Monitor, Palette } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"

import type { ThemePicker } from "./themes.ts"

export const THEME_ICONS: ThemePicker["icons"] = {
  palette: renderToStaticMarkup(createElement(Palette, { size: 20 })),
  device: renderToStaticMarkup(createElement(Monitor, { size: 16 })),
}
