/**
 * The swatch registry — Definition D.3's domain vocabulary (canon §D.1),
 * promoted from `theme-apply.ts`'s hardcoded `TOKENS` string to typed data.
 * Domain data: it lives here, in `some-filter`, never in
 * `@some-extension/transport` (Corollary D.2.1).
 *
 * A *swatch* is one named point in the dark-palette design space. The
 * ergonomics note that motivated this milestone (referenced from #687)
 * argues a comfortable dark theme is a family of chromatic-gray palettes —
 * cool blue-gray, soft green-gray, purple-gray, warm paper, neutral,
 * low-contrast — not one `#fff`-on-`#000` maximum-contrast recipe, because
 * near-white text on a near-black background "becomes the new sun": its
 * apparent luminance dominates the visual field regardless of its RGB
 * value. Six such palettes are seeded below; `DEFAULT_SWATCH_ID` is
 * byte-for-byte today's palette, so selecting it is behavior-preserving.
 *
 * `Φ_comfort` (bottom of this file) is the checkable form of that argument:
 * text is never the brightest thing on screen, contrast lives in a comfort
 * band rather than pinned at the 21:1 maximum, the neutral carries a
 * chromatic bias, and the background is a mid-dark reference rather than a
 * void. It is defined here, statically, over the registry; S6 asserts the
 * same predicate on rendered output. A canon amendment proposing `Φ_comfort`
 * as a named predicate (extending `Φ` or as a sibling) is proposed alongside
 * this story per §10 — see `extensions/docs/dom-state-estimation-canon.typ`.
 */

import { relativeLuminance, type RGBA } from "@filter/lib/content/color"
import { rgbToHSL } from "@filter/lib/content/modify-colors"

/**
 * Generalizes `theme-apply.ts`'s `TOKENS` fields. Every CSS custom property
 * `buildDarkThemeCSS()` currently emits (`--sw-bg-0`, …, plus the
 * previously-hardcoded `code`/`kbd`/`samp` color) has a role here.
 */
export type Swatch = {
  readonly id: string
  readonly label: string
  readonly bg0: string
  readonly bg1: string
  readonly bg2: string
  readonly bg3: string
  readonly surface: string
  readonly border: string
  readonly text0: string
  readonly text1: string
  readonly text2: string
  readonly link: string
  readonly linkVisited: string
  readonly inputBg: string
  readonly inputBorder: string
  readonly selectionBg: string
  readonly codeFg: string
}

export const DEFAULT_SWATCH_ID = "default"

/**
 * `as const satisfies Record<string, Swatch>` — literal id keys are
 * preserved for `keyof typeof SWATCHES`, while every entry is still checked
 * against the full `Swatch` shape: omitting a role on any entry is a type
 * error, not a silently-`undefined` field (the registry's own acceptance
 * bar, #687).
 */
export const SWATCHES = {
  // Today's palette, verbatim (`theme-apply.ts`'s former `TOKENS`) — the
  // active default, so behavior is unchanged until a picker (follow-on)
  // selects otherwise.
  default: {
    id: "default",
    label: "Default",
    bg0: "#0d1117",
    bg1: "#13161d",
    bg2: "#1a1e27",
    bg3: "#21252f",
    surface: "#1e222b",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#e2e8f0",
    text1: "#94a3b8",
    text2: "#475569",
    link: "#7aa2f7",
    linkVisited: "#9d8cf7",
    inputBg: "#1a1e27",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(122, 162, 247, 0.25)",
    codeFg: "#e879f9",
  },
  "cool-blue-gray": {
    id: "cool-blue-gray",
    label: "Cool Blue Gray",
    bg0: "#121620",
    bg1: "#181c25",
    bg2: "#1f242f",
    bg3: "#272b37",
    surface: "#242833",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#cbd5e1",
    text1: "#8797aa",
    text2: "#44505e",
    link: "#7993f6",
    linkVisited: "#a788f6",
    inputBg: "#1f242f",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 147, 246, 0.25)",
    codeFg: "#f577f8",
  },
  "soft-green-gray": {
    id: "soft-green-gray",
    label: "Soft Green Gray",
    bg0: "#141a17",
    bg1: "#1a201d",
    bg2: "#222925",
    bg3: "#29312d",
    surface: "#262d29",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#cfe0d4",
    text1: "#8ca794",
    text2: "#475c4d",
    link: "#79f6c2",
    linkVisited: "#88eff6",
    inputBg: "#222925",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 246, 194, 0.25)",
    codeFg: "#7795f8",
  },
  "purple-gray": {
    id: "purple-gray",
    label: "Purple Gray",
    bg0: "#17141d",
    bg1: "#1d1a23",
    bg2: "#25222c",
    bg3: "#2d2934",
    surface: "#292630",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#ddd3e8",
    text1: "#9d8ab1",
    text2: "#534464",
    link: "#ad79f6",
    linkVisited: "#eb88f6",
    inputBg: "#25222c",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(173, 121, 246, 0.25)",
    codeFg: "#f877ab",
  },
  "warm-paper-dark": {
    id: "warm-paper-dark",
    label: "Warm Paper Dark",
    bg0: "#1c1815",
    bg1: "#221e1b",
    bg2: "#2b2623",
    bg3: "#332e2a",
    surface: "#2f2a27",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#ebe1d3",
    text1: "#b6a388",
    text2: "#675741",
    link: "#f6b979",
    linkVisited: "#f6f688",
    inputBg: "#2b2623",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(246, 185, 121, 0.25)",
    codeFg: "#9ff877",
  },
  "neutral-gray": {
    id: "neutral-gray",
    label: "Neutral Gray",
    bg0: "#17181a",
    bg1: "#1d1e20",
    bg2: "#252628",
    bg3: "#2d2e30",
    surface: "#292a2d",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#d9dadc",
    text1: "#999b9e",
    text2: "#515255",
    link: "#7999f6",
    linkVisited: "#a288f6",
    inputBg: "#252628",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 153, 246, 0.25)",
    codeFg: "#ef77f8",
  },
  "low-contrast-comfort": {
    id: "low-contrast-comfort",
    label: "Low Contrast Comfort",
    bg0: "#16181c",
    bg1: "#1c1e22",
    bg2: "#24262b",
    bg3: "#2b2e32",
    surface: "#282a2f",
    border: "rgba(255, 255, 255, 0.08)",
    text0: "#a8b0ba",
    text1: "#757d87",
    text2: "#3e4248",
    link: "#7999f6",
    linkVisited: "#a288f6",
    inputBg: "#24262b",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 153, 246, 0.25)",
    codeFg: "#ef77f8",
  },
} as const satisfies Record<string, Swatch>

export type SwatchId = keyof typeof SWATCHES

function isSwatchId(id: string): id is SwatchId {
  return id in SWATCHES
}

/** Falls back to the default swatch for an id outside the registry. */
export function getSwatch(id: string): Swatch {
  return isSwatchId(id) ? SWATCHES[id] : SWATCHES[DEFAULT_SWATCH_ID]
}

// ── Φ_comfort ─────────────────────────────────────────────────────────────
//
// "Dark" is not the property; "comfortable" is. Today's zero-leak Φ only
// forbids bright leaks (Remark C.1) — a swatch can pass it while frying the
// eyes (`#fff` on `#000`, contrast 21:1). Φ_comfort is the additional,
// checkable predicate the ergonomics note actually argues for. It is
// defined here over a `Swatch`'s primary (bg0, text0) pair, the pairing the
// note's own claims are about; S6 re-runs it on rendered output.

const TEXT_LUMINANCE_CEILING = 0.92
const CONTRAST_BAND_MIN = 7.5
const CONTRAST_BAND_MAX = 16
const CHROMATIC_SATURATION_FLOOR = 0.03
const BACKGROUND_LUMINANCE_FLOOR = 0.001

function hexToRGBA(hex: string): RGBA {
  const clean = hex.replace("#", "")
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  return [r, g, b, 1]
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const [hi, lo] =
    luminanceA >= luminanceB
      ? [luminanceA, luminanceB]
      : [luminanceB, luminanceA]
  return (hi + 0.05) / (lo + 0.05)
}

export type ComfortReport = {
  /** Primary text is never the brightest thing on screen (no `#fff` text). */
  readonly textNotBrightest: boolean
  /** Contrast lives in the comfort band, not pinned at the 21:1 maximum. */
  readonly contrastInBand: boolean
  /** The neutral carries a chromatic bias — a gray with a hue, not achromatic. */
  readonly chromaticBias: boolean
  /** The background is a mid-dark reference, not a void (`#000`). */
  readonly bgNotBlack: boolean
}

/** Pure predicate over a `Swatch`'s (bg0, text0) pair. No DOM access. */
export function comfortReport(swatch: Swatch): ComfortReport {
  const bg = hexToRGBA(swatch.bg0)
  const text = hexToRGBA(swatch.text0)

  const bgLuminance = relativeLuminance(bg[0], bg[1], bg[2])
  const textLuminance = relativeLuminance(text[0], text[1], text[2])
  const contrast = contrastRatio(bgLuminance, textLuminance)
  const bgSaturation = rgbToHSL(bg).s
  const textSaturation = rgbToHSL(text).s

  return {
    textNotBrightest: textLuminance <= TEXT_LUMINANCE_CEILING,
    contrastInBand:
      contrast >= CONTRAST_BAND_MIN && contrast <= CONTRAST_BAND_MAX,
    chromaticBias:
      bgSaturation >= CHROMATIC_SATURATION_FLOOR &&
      textSaturation >= CHROMATIC_SATURATION_FLOOR,
    bgNotBlack: bgLuminance > BACKGROUND_LUMINANCE_FLOOR,
  }
}

/** `Φ_comfort(swatch)` — every clause of `comfortReport` holds. */
export function satisfiesComfort(swatch: Swatch): boolean {
  const report = comfortReport(swatch)
  return (
    report.textNotBrightest &&
    report.contrastInBand &&
    report.chromaticBias &&
    report.bgNotBlack
  )
}
