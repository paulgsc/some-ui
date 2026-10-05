/**
 * The swatch registry — Definition D.3's domain vocabulary (canon §D.1) as
 * typed data. Domain data: it lives in `some-filter`, never in
 * `@some-extension/transport` (Corollary D.2.1).
 *
 * A *swatch* is one named point in the dark-palette design space: a
 * comfortable dark theme is a family of chromatic-gray palettes, not one
 * `#fff`-on-`#000` recipe, because near-white text on near-black "becomes
 * the new sun". Seven palettes are seeded below.
 *
 * `Φ_comfort` (bottom of this file) is the checkable form of that argument:
 * text is never the brightest thing on screen, contrast sits in a comfort
 * band rather than at 21:1, the neutral carries a chromatic bias, and the
 * background is mid-dark rather than a void. It is defined statically over
 * the registry; the canon amendment proposing it is per §10 (see
 * `docs/canon/dom-state-estimation-canon.typ`).
 */

// Relative, not `@filter/*`-aliased: `filter-classifier` imports this file
// through `@some-extension/filter`'s `./*` source export (to test Φ_comfort
// against rendered fixtures), and its typecheck and esbuild bundling need
// paths they can resolve without this package's tsconfig.
import {
  compositeOver,
  parseColor,
  relativeLuminance,
  type RGBA,
} from "../../lib/content/color"
import { rgbToHSL } from "../../lib/content/modify-colors"

/**
 * One role per CSS custom property `buildDarkThemeCSS()` emits (`--sw-bg-0`,
 * …, plus the `code`/`kbd`/`samp` color).
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
  /**
   * ADR 0002 §2.3 ("E becomes border-led"): the enforcement sheet flattens
   * every vendor background to `bg0`, so a border is the only channel left
   * to carry hierarchy and must be visible on its own. `border` stays the
   * subtle divider the shipped pipeline uses. `borderHierarchyReport` is the
   * checkable form.
   */
  readonly borderStrong: string
  readonly text0: string
  readonly text1: string
  readonly text2: string
  readonly link: string
  readonly linkVisited: string
  readonly inputBg: string
  readonly inputBorder: string
  readonly selectionBg: string
  readonly codeFg: string
  /**
   * ADR 0002 §2.3 amendment: the top-lit lift gradient on structural
   * containers (see `enforcement-sheet.ts`'s header). Light-from-above for a
   * dark swatch; a light swatch would use a dark tint (`rgb(0 0 0 / α)`).
   */
  readonly lift: string
}

export const DEFAULT_SWATCH_ID = "default"

/**
 * The `borderStrong` value shared by every registry entry. 0.35 is the
 * smallest round white-alpha step that clears `NON_TEXT_CONTRAST_FLOOR`
 * (WCAG 2.1 SC 1.4.11's 3:1) against every `bg0` here with margin (the
 * measured minimum was 0.329–0.330). Not trusted on its own:
 * `borderHierarchyReport` checks every entry.
 *
 * A floor against an invisible border, not a visual tuning; that is ADR 0002
 * §7 step 4's eye-strain validation.
 */
const BORDER_STRONG = "rgba(255, 255, 255, 0.35)"

/**
 * The `lift` value shared by every (dark) registry entry. 0.035 is a starting
 * value; a light swatch needs its own dark tint (see `Swatch.lift`).
 */
const LIFT = "rgb(255 255 255 / 0.035)"

/**
 * `as const satisfies Record<string, Swatch>`: literal id keys survive for
 * `keyof typeof SWATCHES`, and omitting a role on any entry is a type error.
 */
export const SWATCHES = {
  // Tuned for sustained-reading comfort, which is served by minimizing
  // luminance *transitions* over a session:
  //
  // 1. `text0` is a desaturated "reading gray" (213.5°, 21.6% sat, L 61%);
  //    the earlier near-white pair (contrast 15.35) scored hostile in a blind
  //    Comfort Lab eye test despite passing the predicate.
  // 2. `bg0` is `#171c25` (luminance 0.01146, about Tokyo Night's) rather
  //    than near-black, which maximizes adaptation distance to anything
  //    brighter. `bg1`/`bg2`/`bg3`/`surface`/`inputBg` keep the original
  //    luminance gaps between tiers so the elevation ramp survives.
  //
  // Together: contrast 5.86, which sets CONTRAST_BAND_MIN below.
  default: {
    id: "default",
    label: "Default",
    bg0: "#171c25",
    bg1: "#1b1f29",
    bg2: "#212631",
    bg3: "#272b37",
    surface: "#242934",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: BORDER_STRONG,
    text0: "#8699b1",
    text1: "#94a3b8",
    text2: "#475569",
    link: "#7aa2f7",
    linkVisited: "#9d8cf7",
    inputBg: "#212631",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(122, 162, 247, 0.25)",
    codeFg: "#e879f9",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#cbd5e1",
    text1: "#8797aa",
    text2: "#44505e",
    link: "#7993f6",
    linkVisited: "#a788f6",
    inputBg: "#1f242f",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 147, 246, 0.25)",
    codeFg: "#f577f8",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#cfe0d4",
    text1: "#8ca794",
    text2: "#475c4d",
    link: "#79f6c2",
    linkVisited: "#88eff6",
    inputBg: "#222925",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 246, 194, 0.25)",
    codeFg: "#7795f8",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#ddd3e8",
    text1: "#9d8ab1",
    text2: "#534464",
    link: "#ad79f6",
    linkVisited: "#eb88f6",
    inputBg: "#25222c",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(173, 121, 246, 0.25)",
    codeFg: "#f877ab",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#ebe1d3",
    text1: "#b6a388",
    text2: "#675741",
    link: "#f6b979",
    linkVisited: "#f6f688",
    inputBg: "#2b2623",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(246, 185, 121, 0.25)",
    codeFg: "#9ff877",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#d9dadc",
    text1: "#999b9e",
    text2: "#515255",
    link: "#7999f6",
    linkVisited: "#a288f6",
    inputBg: "#252628",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 153, 246, 0.25)",
    codeFg: "#ef77f8",
    lift: LIFT,
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
    borderStrong: BORDER_STRONG,
    text0: "#a8b0ba",
    text1: "#757d87",
    text2: "#3e4248",
    link: "#7999f6",
    linkVisited: "#a288f6",
    inputBg: "#24262b",
    inputBorder: "rgba(255, 255, 255, 0.15)",
    selectionBg: "rgba(121, 153, 246, 0.25)",
    codeFg: "#ef77f8",
    lift: LIFT,
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
// "Dark" is not the property; "comfortable" is. The zero-leak Φ only forbids
// bright leaks (Remark C.1); a swatch can pass it while frying the eyes
// (`#fff` on `#000`, 21:1). Φ_comfort is the additional checkable predicate.
//
// Defined over any observed `ComfortSample`, not just a registry entry, so
// rendered fixtures (`getComputedStyle` strings via `parseColor`) can be
// classified too. `swatchSample` is the only thing that knows about hex.
const TEXT_LUMINANCE_CEILING = 0.92
// 5.5 accommodates `default`'s deliberately lower-contrast reading-gray pair
// (5.86) with margin. There is no eye-score evidence that pair reads as
// hostile; lower contrast is the point.
const CONTRAST_BAND_MIN = 5.5
// The original 16 let a pair through at 15.35 that a blind eye test scored
// hostile ("the text is basically the sun"). 14 sits in the real gap between
// that and the highest registry swatch (`warm-paper-dark`, 13.64).
const CONTRAST_BAND_MAX = 14
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

/** The (background, text) pair Φ_comfort is evaluated over — from a swatch's own tokens (`swatchSample`) or from a live `getComputedStyle` sample via `color.ts`'s `parseColor`. */
export type ComfortSample = {
  readonly bg: RGBA
  readonly text: RGBA
}

/** Extracts the (bg0, text0) pair a `Swatch` has always been checked against. */
export function swatchSample(swatch: Swatch): ComfortSample {
  return { bg: hexToRGBA(swatch.bg0), text: hexToRGBA(swatch.text0) }
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

/** Pure predicate over a `(bg, text)` sample. No DOM access. */
export function comfortReport(sample: ComfortSample): ComfortReport {
  const { bg, text } = sample

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

/** `Φ_comfort(sample)` — every clause of `comfortReport` holds. */
export function satisfiesComfort(sample: ComfortSample): boolean {
  const report = comfortReport(sample)
  return (
    report.textNotBrightest &&
    report.contrastInBand &&
    report.chromaticBias &&
    report.bgNotBlack
  )
}

// ── Border-led hierarchy (ADR 0002 §2.3) ────────────────────────────────────
//
// Independent of Φ_comfort: a different concern over a different pair
// ((bg, border), never (bg, text)). Kept separate because external consumers
// (`filter-classifier`) depend on `ComfortSample`'s meaning.
//
// WCAG 2.1 SC 1.4.11 ("Non-text Contrast") sets 3:1 as the floor for a UI
// component's boundary against its background, applied to `borderStrong`
// composited over `bg0`.
const NON_TEXT_CONTRAST_FLOOR = 3.0

/** The `(bg, border)` pair `borderHierarchyReport` is evaluated over. `border` is composited over `bg` (`compositeOver`) before its luminance is read: registry values are translucent white, and contrast is measured against what is painted. */
export type BorderSample = {
  readonly bg: RGBA
  readonly border: RGBA
}

/** Extracts the (bg0, borderStrong) pair a `Swatch` is checked against. */
export function borderSample(swatch: Swatch): BorderSample {
  const border = parseColor(swatch.borderStrong)
  return {
    bg: hexToRGBA(swatch.bg0),
    // Every registry value parses (unit-tested); transparent black on a null
    // parse makes the floor check fail rather than silently pass.
    border: border ?? [0, 0, 0, 0],
  }
}

export type BorderHierarchyReport = {
  /** `border`, composited over `bg`, clears `NON_TEXT_CONTRAST_FLOOR` against `bg` alone — WCAG 2.1 SC 1.4.11. */
  readonly nonTextContrastMet: boolean
}

/** Pure predicate over a `(bg, border)` sample. No DOM access. */
export function borderHierarchyReport(
  sample: BorderSample
): BorderHierarchyReport {
  const { bg, border } = sample
  const bgLuminance = relativeLuminance(bg[0], bg[1], bg[2])
  const composited = compositeOver(border, bg)
  const compositedLuminance = relativeLuminance(
    composited[0],
    composited[1],
    composited[2]
  )
  return {
    nonTextContrastMet:
      contrastRatio(compositedLuminance, bgLuminance) >=
      NON_TEXT_CONTRAST_FLOOR,
  }
}

/** The checkable form of ADR 0002 §2.3's border-led claim — every clause of `borderHierarchyReport` holds. */
export function satisfiesBorderHierarchy(sample: BorderSample): boolean {
  return borderHierarchyReport(sample).nonTextContrastMet
}
