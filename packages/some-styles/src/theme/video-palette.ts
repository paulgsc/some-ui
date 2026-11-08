/**
 * Mochi Night, the palette made for video (SFEED10, paulgsc/some-ui#2675),
 * and the rules it is held to: what YouTube's encode does to colour, as the
 * research on #2675 measured it.
 *
 * - x264 at 4:2:0 keeps colour at half the resolution of brightness, so a
 *   thin stroke that differs from its ground only in hue loses half its
 *   contrast. Text has to differ in brightness: ink is nearly grey.
 * - A frame of near-peak white is dimmed by TVs and OLED panels, and a dark
 *   gradient spans so few of the 219 video steps that it bands, so the
 *   ground is flat and dark, and no ink is pure white.
 *
 * `MOCHI_NIGHT` is the source: `themes/mochi-night.css` writes each role in
 * oklch, and its test holds the two equal. `videoPaletteProblems` measures
 * rules 1, 2 and 4; rule 3, a real encode, is `@some-ui/video-render`'s test
 * (`video-palette.test.ts` there), since that package carries ffmpeg; rule
 * 5, that a warning always comes with a word or a glyph, is a stage's.
 * The thresholds in rules 2 to 4 are settings, not research results.
 */

import type { Oklch } from "./feeling"

/** The palette's roles, as `#rrggbb`. */
export const MOCHI_NIGHT = {
  background: "#241a13",
  surface: "#33261c",
  ink: "#f0e4d0",
  mutedInk: "#ab9a82",
  honey: "#f2aa3c",
  sky: "#78c2e8",
  warning: "#f0705a",
  success: "#8ccf9a",
  highlight: "#5b4214",
} as const

export type VideoPalette = Readonly<Record<keyof typeof MOCHI_NIGHT, string>>

/** The rules' thresholds (#2675, "Rules a test can hold"). */
export const VIDEO_RULES = {
  /** Rule 1: ink on every ground it sits on. */
  inkContrast: 7,
  /**
   * Rule 1: an accent, and muted ink, on the ground, also as each colour
   * blindness sees it. Not on a card: the warning there is 4.1:1 to someone
   * with protanopia, which is why it always comes with a word or a glyph.
   */
  accentContrast: 4.5,
  /** Rule 2: ink and muted ink are nearly grey (BT.709 chroma). */
  inkChroma: 0.08,
  /** Rule 2: no text colour is strongly saturated. */
  textChroma: 0.3,
  /** Rule 4: the ground's luma, dark and never black. */
  groundLuma: [0.06, 0.2],
  /** Rule 4: ink's luma, never pure white. */
  inkLuma: 0.92,
  /** Rule 4: every channel inside the steps a video keeps, in 8 bits. */
  channel: [10, 245],
} as const

type Rgb = readonly [number, number, number]

/** The colour's 8-bit channels. */
export function channels(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const decode = (c: number): number => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const linear = (hex: string): Rgb => {
  const [r, g, b] = channels(hex)
  return [decode(r), decode(g), decode(b)]
}

const luminanceOf = ([r, g, b]: Rgb): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b

/** WCAG 2.2's contrast between two colours' relative luminances. */
const ratio = (x: number, y: number): number =>
  (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)

export const contrast = (a: string, b: string): number =>
  ratio(luminanceOf(linear(a)), luminanceOf(linear(b)))

export type Deficiency = "protan" | "deutan" | "tritan"

/** Machado, Oliveira and Fernandes (2009), severity 1, in linear sRGB. */
const MACHADO: Readonly<Record<Deficiency, readonly [Rgb, Rgb, Rgb]>> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

/** The colour as someone with `kind` sees it, in linear sRGB. */
function simulated(hex: string, kind: Deficiency): Rgb {
  const c = linear(hex)
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  const row = (m: Rgb): number => clamp(m[0] * c[0] + m[1] * c[1] + m[2] * c[2])
  const [r, g, b] = MACHADO[kind]
  return [row(r), row(g), row(b)]
}

/** Contrast between two colours as someone with `kind` sees them. */
export const contrastSeenBy = (
  kind: Deficiency,
  a: string,
  b: string
): number =>
  ratio(luminanceOf(simulated(a, kind)), luminanceOf(simulated(b, kind)))

/** BT.709 luma (Y') and chroma (the length of Cb, Cr), from 0 to 1. */
export function bt709(hex: string): { luma: number; chroma: number } {
  const [r, g, b] = channels(hex)
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const cb = (b / 255 - luma) / 1.8556
  const cr = (r / 255 - luma) / 1.5748
  return { luma, chroma: Math.hypot(cb, cr) }
}

/** The colour in oklch, as `themes/*.css` writes one: L from 0 to 1, H in degrees. */
export function oklchOf(hex: string): Oklch {
  const [r, g, b] = linear(hex)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h]
}

const DEFICIENCIES: ReadonlyArray<Deficiency> = ["protan", "deutan", "tritan"]

/** Every way `p` breaks rules 1, 2 and 4, in words; none for a palette that holds. */
export function videoPaletteProblems(p: VideoPalette): Array<string> {
  const R = VIDEO_RULES
  const problems: Array<string> = []
  const grounds = { background: p.background, surface: p.surface }
  const fixed = (n: number): string => n.toFixed(2)
  // Rule 1.
  for (const [name, ground] of Object.entries({
    ...grounds,
    highlight: p.highlight,
  })) {
    const c = contrast(p.ink, ground)
    if (c < R.inkContrast)
      problems.push(`ink on ${name} is ${fixed(c)}:1, under ${R.inkContrast}:1`)
  }
  const accents = {
    mutedInk: p.mutedInk,
    honey: p.honey,
    sky: p.sky,
    warning: p.warning,
    success: p.success,
  }
  // On the ground a video's frame is, as the research measured them.
  for (const [name, accent] of Object.entries(accents)) {
    const least = Math.min(
      contrast(accent, p.background),
      ...DEFICIENCIES.map((kind) => contrastSeenBy(kind, accent, p.background))
    )
    if (least < R.accentContrast)
      problems.push(
        `${name} on the ground is ${fixed(least)}:1 as some see it, under ${R.accentContrast}:1`
      )
  }
  // Rule 2.
  for (const [name, hex] of Object.entries({
    ink: p.ink,
    mutedInk: p.mutedInk,
  })) {
    const { chroma } = bt709(hex)
    if (chroma > R.inkChroma)
      problems.push(`${name}'s chroma is ${fixed(chroma)}, over ${R.inkChroma}`)
  }
  for (const [name, hex] of Object.entries(accents)) {
    const { chroma } = bt709(hex)
    if (chroma > R.textChroma)
      problems.push(
        `${name}'s chroma is ${fixed(chroma)}, over ${R.textChroma}`
      )
  }
  // Rule 4.
  const ground = bt709(p.background).luma
  if (ground < R.groundLuma[0] || ground > R.groundLuma[1])
    problems.push(
      `the ground's luma is ${fixed(ground)}, outside ${R.groundLuma.join(" to ")}`
    )
  const ink = bt709(p.ink).luma
  if (ink > R.inkLuma)
    problems.push(`ink's luma is ${fixed(ink)}, over ${R.inkLuma}`)
  for (const [name, hex] of Object.entries(p))
    for (const c of channels(hex))
      if (c < R.channel[0] || c > R.channel[1])
        problems.push(
          `${name} has a channel at ${c}, outside ${R.channel.join(" to ")}`
        )
  return problems
}
