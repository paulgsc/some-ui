/**
 * Feeling themes: the makjang webtoon's one closed set, as presentation
 * (docs/makjang/README.md, "The webtoon: one feeling per scene").
 *
 * A feeling is a point on the valence × arousal plane, a hue, one texture and
 * one motion. Every colour, edge and timing is derived from that point
 * relative to the session theme the person chose, so each feeling lives
 * inside every session theme rather than beside it: a new feeling is a new
 * point, never a new palette. Topik owns the words (caption, cry, lettering)
 * and the symbols, keyed by the same `FeelingKey`.
 *
 * A feeling never overrides a session role. `themes/feeling.css`, generated
 * from this module by `scripts/write-feeling-css.ts`, declares only private
 * `--feeling-*` tokens, and the drama's buttons and choice panel stay the
 * session's.
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK5: every feeling clears the contrast floor on every session theme
 *   (`__tests__/feeling.test.ts` resolves the session themes' real CSS).
 */

import type { SessionTheme } from "./registry"

export const FEELING_KEYS = [
  "tension",
  "rivalry",
  "chill",
  "cringe",
  "fury",
  "twist",
  "flutter",
  "warmth",
] as const

export type FeelingKey = (typeof FEELING_KEYS)[number]

const KEYS: ReadonlySet<string> = new Set(FEELING_KEYS)

export const isFeelingKey = (value: string): value is FeelingKey =>
  KEYS.has(value)

export type FeelingTexture =
  | "lines"
  | "stripes"
  | "dots"
  | "tone"
  | "burst"
  | "petals"
  | "none"

/** The eight keyframe kinds, one per feeling. */
export type FeelingMotion =
  | "settle"
  | "flicker"
  | "frost"
  | "shake"
  | "slam"
  | "punch"
  | "float"
  | "glow"

export type FeelingPoint = {
  /** Unpleasant −1 to pleasant 1. */
  valence: number
  /** Calm −1 to agitated 1. */
  arousal: number
  /** oklch hue, in degrees. */
  hue: number
  texture: FeelingTexture
  motion: FeelingMotion
}

/** The only authored part of a feeling theme: the doc's vocabulary table. */
export const FEELING_POINTS: Readonly<Record<FeelingKey, FeelingPoint>> = {
  tension: {
    valence: -0.35,
    arousal: 0.45,
    hue: 260,
    texture: "lines",
    motion: "settle",
  },
  rivalry: {
    valence: -0.45,
    arousal: 0.7,
    hue: 300,
    texture: "stripes",
    motion: "flicker",
  },
  chill: {
    valence: -0.6,
    arousal: -0.45,
    hue: 235,
    texture: "dots",
    motion: "frost",
  },
  cringe: {
    valence: -0.3,
    arousal: 0.3,
    hue: 350,
    texture: "tone",
    motion: "shake",
  },
  fury: {
    valence: -0.85,
    arousal: 0.95,
    hue: 28,
    texture: "burst",
    motion: "slam",
  },
  twist: {
    valence: 0,
    arousal: 0.9,
    hue: 95,
    texture: "burst",
    motion: "punch",
  },
  flutter: {
    valence: 0.7,
    arousal: 0.55,
    hue: 345,
    texture: "petals",
    motion: "float",
  },
  warmth: {
    valence: 0.75,
    arousal: -0.35,
    hue: 75,
    texture: "none",
    motion: "glow",
  },
}

// ── Colour ──────────────────────────────────────────────────────────────────

/** `[lightness 0..1, chroma, hue in degrees]`. */
export type Oklch = readonly [number, number, number]

const toLab = ([l, c, h]: Oklch): [number, number, number] => {
  const radians = (h * Math.PI) / 180
  return [l, c * Math.cos(radians), c * Math.sin(radians)]
}

const toLch = ([l, a, b]: [number, number, number]): Oklch => {
  const chroma = Math.hypot(a, b)
  if (chroma < 0.0005) return [l, 0, 0]
  const hue = (Math.atan2(b, a) * 180) / Math.PI
  return [l, chroma, hue < 0 ? hue + 360 : hue]
}

/** `color-mix(in oklab, from, to weight)`: `weight` of `to`. */
export function mixOklab(from: Oklch, to: Oklch, weight: number): Oklch {
  const [l1, a1, b1] = toLab(from)
  const [l2, a2, b2] = toLab(to)
  const at = (x: number, y: number): number => x * (1 - weight) + y * weight
  return toLch([at(l1, l2), at(a1, a2), at(b1, b2)])
}

/** WCAG 2 relative luminance, through linear sRGB (gamut-clamped). */
function luminance(color: Oklch): number {
  const [L, A, B] = toLab(color)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const b = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Body ink and muted text, and marks (symbol, lettering, texture). */
export const CONTRAST_FLOOR = { text: 4.5, mark: 3 } as const

/**
 * `color`, its lightness stepped away from `ground` until it clears `floor`.
 * It stops at black or white, so a ground too close to both still falls
 * short, and the floor's test says so.
 */
function clear(color: Oklch, ground: Oklch, floor: number): Oklch {
  const away = luminance(ground) > 0.18 ? -0.01 : 0.01
  let [l, c, h] = color
  for (let i = 0; i < 100 && contrastRatio([l, c, h], ground) < floor; i++) {
    l = Math.min(1, Math.max(0, l + away))
  }
  return [l, c, h]
}

/** The session roles a feeling is derived from, resolved to colours. */
export type SessionRoles = {
  mode: "light" | "dark"
  background: Oklch
  foreground: Oklch
  mutedForeground: Oklch
}

export type FeelingColors = {
  ground: Oklch
  /** Body text and the panel's edge. */
  ink: Oklch
  muted: Oklch
  /** Symbol, lettering and texture. */
  accent: Oklch
  caption: { fill: Oklch; stroke: Oklch; halo: Oklch }
  /** A reveal swaps ground and ink. */
  reveal: boolean
}

const isReveal = ({ valence, arousal }: FeelingPoint): boolean =>
  Math.abs(valence) < 0.2 && arousal >= 0.8

/** The doc's "Derived, never chosen" rules, for one feeling on one session. */
export function feelingColors(
  key: FeelingKey,
  session: SessionRoles
): FeelingColors {
  const point = FEELING_POINTS[key]
  const { hue } = point
  const dark = session.mode === "dark"
  const v = Math.abs(point.valence)
  const a = Math.max(point.arousal, 0)
  const turn = (color: Oklch): Oklch =>
    mixOklab(color, [color[0], 0.09, hue], 0.5)

  const reveal = isReveal(point)
  let ground: Oklch
  let ink: Oklch
  let muted: Oklch
  if (reveal) {
    ground = mixOklab(session.foreground, [0.5, 0.1, hue], 0.08)
    ink = session.background
    muted = mixOklab(session.background, session.foreground, 0.28)
  } else {
    const tint: Oklch = [dark ? 0.42 : 0.86 - 0.08 * a, 0.04 + 0.12 * v, hue]
    ground = mixOklab(session.background, tint, (dark ? 0.24 : 0.18) + 0.14 * v)
    ink = turn(session.foreground)
    muted = turn(session.mutedForeground)
  }
  // On a reveal the ground is the session's ink, so its accent is the other
  // mode's.
  const lightAccent = dark === reveal
  const accent: Oklch = [lightAccent ? 0.52 : 0.8, 0.06 + 0.12 * v, hue]

  return {
    ground,
    ink: clear(ink, ground, CONTRAST_FLOOR.text),
    muted: clear(muted, ground, CONTRAST_FLOOR.text),
    accent: clear(accent, ground, CONTRAST_FLOOR.mark),
    caption: {
      fill: [0.87, reveal ? 0.16 : 0.14, hue],
      stroke: [0.22, 0.06, hue],
      halo: session.background,
    },
    reveal,
  }
}

// ── Edge, texture and motion ────────────────────────────────────────────────

export type FeelingFrame = {
  /** Px of ink; 0 when the edge is jagged. */
  edgeWidth: number
  jagged: boolean
  /** Px. */
  radius: number
  /** Texture alpha, 10–18%, rising with arousal. */
  textureAlpha: number
  /** Played once. */
  motionMs: number
  amplitude: number
}

export function feelingFrame(key: FeelingKey): FeelingFrame {
  const { valence, arousal } = FEELING_POINTS[key]
  const a = Math.max(arousal, 0)
  const jagged = valence <= -0.6 && arousal >= 0.8
  return {
    edgeWidth: jagged ? 0 : 2 + 2 * a,
    jagged,
    radius: valence >= 0.4 ? Math.round(20 * valence) : 2,
    textureAlpha: 0.1 + 0.08 * a,
    motionMs: Math.round(950 - 450 * a),
    amplitude: 0.35 + 0.65 * a,
  }
}

// ── The stylesheet ──────────────────────────────────────────────────────────

/**
 * A feeling panel is two elements: a frame with the feeling's theme class,
 * which carries its tokens and draws a jagged edge's outline (a clip cuts its
 * own element's outline away), and inside it the `.feeling` panel itself.
 */
export const FEELING_FRAME_CLASS = "feeling-frame"

export const FEELING_CLASS = "feeling"

/** The frame's class for `key`'s tokens. */
export const feelingThemeClass = (key: FeelingKey): string =>
  `${FEELING_CLASS}-${key}`

/** On a frame: plays the feeling's motion once, unless reduced motion is preferred. */
export const FEELING_MOTION_CLASS = "feeling-motion"

const css = ([l, c, h]: Oklch, alpha?: number): string =>
  `oklch(${Number((l * 100).toFixed(2))}% ${Number(c.toFixed(4))} ${Number(
    h.toFixed(1)
  )}deg${alpha === undefined ? "" : ` / ${Number((alpha * 100).toFixed(1))}%`})`

const px = (n: number): string => {
  const rounded = Number(n.toFixed(2))
  return rounded === 0 ? "0" : `${rounded}px`
}

/** A texture's layers in `color`, denser as arousal `a` rises. */
const TEXTURES: Readonly<
  Record<FeelingTexture, (color: string, a: number) => string | null>
> = {
  lines: (color, a) =>
    `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px ${px(Math.round(10 - 4 * a))})`,
  stripes: (color, a) =>
    `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px ${px(Math.round(14 - 4 * a))})`,
  dots: (color, a) => {
    const size = px(Math.round(16 - 4 * a))
    return `radial-gradient(${color} 1px, transparent 1.6px) 0 0 / ${size} ${size}`
  },
  tone: (color, a) => {
    const size = px(Math.round(10 - 3 * a))
    return `radial-gradient(${color} 1.3px, transparent 1.8px) 0 0 / ${size} ${size}`
  },
  burst: (color, a) =>
    `repeating-conic-gradient(from 0deg at 50% 50%, ${color} 0deg 2deg, transparent 2deg ${Math.round(14 - 5 * a)}deg)`,
  petals: (color) =>
    `radial-gradient(circle, ${color} 0 3px, transparent 3.5px) 0 0 / 26px 26px, radial-gradient(circle, ${color} 0 2px, transparent 2.5px) 13px 13px / 26px 26px`,
  none: () => null,
}

/** A keyframe: its stop and its declarations. */
type Stop = readonly [string, ReadonlyArray<string>]

/** Each motion's keyframes at amplitude `k`. */
const KEYFRAMES: Readonly<
  Record<FeelingMotion, (k: number) => ReadonlyArray<Stop>>
> = {
  settle: (k) => [
    [
      "0%",
      [
        `transform: scale(${(1 + 0.07 * k).toFixed(3)})`,
        "filter: brightness(0.8)",
      ],
    ],
    ["100%", ["transform: none", "filter: none"]],
  ],
  flicker: (k) => [
    ["0%", ["opacity: 0.2", `transform: translateX(${px(-3 * k)})`]],
    ["12%", ["opacity: 1", "transform: none"]],
    ["24%", ["opacity: 0.45"]],
    ["36%, 100%", ["opacity: 1"]],
  ],
  frost: () => [
    ["0%", ["opacity: 0", "filter: blur(4px) saturate(0)"]],
    ["60%", ["opacity: 1", "filter: blur(0) saturate(0.4)"]],
    ["100%", ["filter: none"]],
  ],
  shake: (k) => [
    ["0%, 100%", ["transform: none"]],
    ["15%", [`transform: translateX(${px(-6 * k)})`]],
    ["30%", [`transform: translateX(${px(6 * k)})`]],
    ["45%", [`transform: translateX(${px(-4 * k)})`]],
    ["60%", [`transform: translateX(${px(4 * k)})`]],
    ["75%", [`transform: translateX(${px(-2 * k)})`]],
  ],
  slam: (k) => [
    ["0%", ["opacity: 0", "transform: scale(1.35) rotate(-4deg)"]],
    ["30%", ["opacity: 1", "transform: scale(0.97)"]],
    ["45%", [`transform: translateX(${px(8 * k)})`]],
    ["60%", [`transform: translateX(${px(-8 * k)})`]],
    ["75%", [`transform: translateX(${px(4 * k)})`]],
    ["100%", ["transform: none"]],
  ],
  punch: (k) => [
    ["0%", ["opacity: 0", `transform: scale(${(1 + 0.3 * k).toFixed(3)})`]],
    ["55%", ["opacity: 1", "transform: scale(0.98)"]],
    ["100%", ["transform: none"]],
  ],
  float: (k) => [
    ["0%", ["opacity: 0", `transform: translateY(${px(16 * k)})`]],
    ["70%", ["opacity: 1", `transform: translateY(${px(-4 * k)})`]],
    ["100%", ["transform: none"]],
  ],
  glow: () => [
    ["0%", ["filter: none"]],
    [
      "40%",
      ["filter: brightness(1.12) saturate(1.3)", "transform: scale(1.015)"],
    ],
    ["100%", ["filter: none", "transform: none"]],
  ],
}

/** A zigzag edge, `depth` px deep, as a `clip-path` polygon. */
function zigzag(depth: number): string {
  const points: Array<string> = []
  const d = (i: number): number => (i % 2 ? depth : 0)
  for (let i = 0; i <= 20; i++) points.push(`${i * 5}% ${d(i)}px`)
  for (let j = 1; j < 10; j++) points.push(`calc(100% - ${d(j)}px) ${j * 10}%`)
  for (let i = 20; i >= 0; i--) points.push(`${i * 5}% calc(100% - ${d(i)}px)`)
  for (let j = 9; j >= 1; j--) points.push(`${d(j)}px ${j * 10}%`)
  return `polygon(${points.join(", ")})`
}

/** The descendant selector that scopes a rule to a session theme. */
const sessionScope = (theme: SessionTheme): string =>
  theme.boundary.classNames.length === 0
    ? ""
    : `${theme.boundary.classNames.map((name) => `.${name}`).join("")} `

const property = (declaration: string): string =>
  declaration.slice(0, declaration.indexOf(":"))

/** A rule, its declarations in the order stylelint asks for. */
const block = (
  selector: string,
  declarations: ReadonlyArray<string>,
  indent = "  "
): string =>
  `${indent}${selector} {\n${[...declarations]
    .sort((a, b) => property(a).localeCompare(property(b)))
    .map((line) => `${indent}  ${line};`)
    .join("\n")}\n${indent}}`

/**
 * `themes/feeling.css`: every feeling on every session theme, as private
 * tokens under a descendant selector of that theme's root classes, plus the
 * rules that paint a `.feeling` element with them. Session themes are given
 * with their resolved roles; a theme with no root class is the default.
 */
export function feelingStylesheet(
  sessions: ReadonlyArray<{ theme: SessionTheme; roles: SessionRoles }>
): string {
  const rules: Array<string> = [
    block(`.${FEELING_CLASS}`, [
      "background: var(--feeling-background)",
      "color: var(--feeling-ink)",
      "border: var(--feeling-edge-width) solid var(--feeling-ink)",
      "border-radius: var(--feeling-radius)",
      "clip-path: var(--feeling-clip)",
    ]),
    block(`.${FEELING_CLASS} .feeling-muted`, ["color: var(--feeling-muted)"]),
    block(`.${FEELING_CLASS} .feeling-accent`, [
      "color: var(--feeling-accent)",
    ]),
    // A two-ring outline plus a drop, as variety-show captions are lettered.
    block(`.${FEELING_CLASS} .feeling-caption`, [
      "color: var(--feeling-caption-fill)",
      `text-shadow: ${[0, 90, 180, 270, 45, 135, 225, 315]
        .map((deg) => {
          const r = (deg * Math.PI) / 180
          return `${px(Math.cos(r) * 2)} ${px(Math.sin(r) * 2)} 0 var(--feeling-caption-stroke)`
        })
        .concat(
          [0, 60, 120, 180, 240, 300].map((deg) => {
            const r = (deg * Math.PI) / 180
            return `${px(Math.cos(r) * 4)} ${px(Math.sin(r) * 4)} 0 var(--feeling-caption-halo)`
          })
        )
        .join(", ")}`,
    ]),
    block(`.${FEELING_FRAME_CLASS}`, ["filter: var(--feeling-outline)"]),
    block(`.${FEELING_MOTION_CLASS}`, ["animation: var(--feeling-animation)"]),
  ]

  if (!sessions.some(({ theme }) => sessionScope(theme) === "")) {
    throw new Error("feelingStylesheet needs the default session theme")
  }
  for (const key of FEELING_KEYS) {
    const point = FEELING_POINTS[key]
    const frame = feelingFrame(key)
    const stops = KEYFRAMES[point.motion](frame.amplitude).map(([stop, body]) =>
      block(stop, body, "    ")
    )
    rules.push(`  @keyframes feeling-${key} {\n${stops.join("\n\n")}\n  }`)
    const own = [
      `--feeling-edge-width: ${px(frame.edgeWidth)}`,
      `--feeling-radius: ${px(frame.radius)}`,
      `--feeling-clip: ${frame.jagged ? zigzag(7) : "none"}`,
      `--feeling-animation: feeling-${key} ${frame.motionMs}ms cubic-bezier(0.2, 0.8, 0.3, 1) both`,
    ]
    for (const { theme, roles } of sessions) {
      const colors = feelingColors(key, roles)
      const layer = TEXTURES[point.texture](
        css(colors.accent, frame.textureAlpha),
        Math.max(point.arousal, 0)
      )
      const ink = css(colors.ink)
      // The default session's colours share the feeling's own rule.
      const scope = sessionScope(theme)
      rules.push(
        block(`${scope}.${feelingThemeClass(key)}`, [
          ...(scope === "" ? own : []),
          `--feeling-ground: ${css(colors.ground)}`,
          `--feeling-ink: ${ink}`,
          `--feeling-muted: ${css(colors.muted)}`,
          `--feeling-accent: ${css(colors.accent)}`,
          `--feeling-background: ${layer ? `${layer}, ` : ""}${css(colors.ground)}`,
          `--feeling-caption-fill: ${css(colors.caption.fill)}`,
          `--feeling-caption-stroke: ${css(colors.caption.stroke)}`,
          `--feeling-caption-halo: ${css(colors.caption.halo)}`,
          `--feeling-outline: ${
            frame.jagged
              ? ["2.5px 0", "-2.5px 0", "0 2.5px", "0 -2.5px"]
                  .map((offset) => `drop-shadow(${offset} 0 ${ink})`)
                  .join(" ")
              : "none"
          }`,
        ])
      )
    }
  }

  return [
    "/* ============================================================",
    "   FEELING THEMES (generated: do not edit)",
    "   ------------------------------------------------------------",
    "   Written by `pnpm --filter @some-ui/styles generate:feelings`",
    "   from src/theme/feeling.ts and the session themes' own CSS.",
    "   Each feeling declares only private --feeling-* tokens per",
    "   session theme, so it never overrides a session role.",
    "   ============================================================ */",
    "",
    "@layer base {",
    rules.join("\n\n"),
    "",
    `  @media (prefers-reduced-motion: reduce) {\n    .${FEELING_MOTION_CLASS} {\n      animation: none;\n    }\n  }`,
    "}",
    "",
  ].join("\n")
}
