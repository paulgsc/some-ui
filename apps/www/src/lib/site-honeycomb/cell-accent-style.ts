import type { CSSProperties } from "react"

/** `CSSProperties` doesn't model custom properties, so this is typed
 * explicitly rather than asserted at each call site. */
export type CellAccentStyle = CSSProperties & { "--site-cell-accent": string }

export const cellAccentStyle = (accent: string): CellAccentStyle => ({
  "--site-cell-accent": accent,
})
