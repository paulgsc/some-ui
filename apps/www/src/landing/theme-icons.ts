/**
 * The theme picker's icons (C1184): the very marks the app's own theme
 * switcher shows (components/theme-switcher.tsx), lucide's Palette on its
 * button and Monitor beside "System", drawn as plain SVG where the site is
 * built, since the page runs no script.
 */
import { createElement } from "react"
import { Monitor, Palette } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"

import type { ThemePicker } from "./themes.ts"

export const THEME_ICONS: ThemePicker["icons"] = {
  palette: renderToStaticMarkup(createElement(Palette, { size: 18 })),
  device: renderToStaticMarkup(createElement(Monitor, { size: 14 })),
}
