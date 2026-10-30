/**
 * A caption look: its type, its colours, its outline and plate, and its
 * effects. Colours here are the video's, not the app's: they are burned into
 * a short and do not follow the site's light or dark theme, so they are
 * literals rather than the design system's tokens.
 *
 * Fonts must be free to embed in video. Every look uses Barlow Condensed
 * (SIL Open Font License 1.1), which the host page loads in the weights
 * named here (apps/www, `lib/web-surface/captions`).
 */

const FONT_STACK = '"Barlow Condensed", "Arial Narrow", sans-serif'

export const THEME_IDS = ["gridiron", "broadcast", "chalk"] as const
export type ThemeId = (typeof THEME_IDS)[number]

export type CaptionTheme = {
  readonly id: ThemeId
  readonly font: {
    readonly family: string
    readonly weight: 600 | 800
    /** At 1080x1920. */
    readonly sizePx: number
    /** Line height as a multiple of the size. */
    readonly lineHeight: number
    /**
     * The width model's one number (`./lines`): an upper bound of the font's
     * average advance, in ems, at this weight and case.
     */
    readonly charWidthEm: number
    readonly letterSpacingEm: number
    readonly uppercase: boolean
  }
  readonly colours: {
    readonly text: string
    /** The word being said, when `effects.highlight` is on. */
    readonly highlight: string
    readonly stroke: string
  }
  /** The outline's width at 1080x1920; 0 for none. */
  readonly strokePx: number
  readonly plate: {
    readonly colour: string
    readonly opacity: number
    readonly radiusPx: number
    readonly padXPx: number
    readonly padYPx: number
  } | null
  readonly effects: {
    /** Colour the word being said. */
    readonly highlight: boolean
    /**
     * How long a word takes to pop in once it is said; 0 shows every word of
     * a caption from its first.
     */
    readonly popInMs: number
  }
}

export const THEMES: Readonly<Record<ThemeId, CaptionTheme>> = {
  gridiron: {
    id: "gridiron",
    font: {
      family: FONT_STACK,
      weight: 800,
      sizePx: 84,
      lineHeight: 1.08,
      charWidthEm: 0.56,
      letterSpacingEm: 0.01,
      uppercase: true,
    },
    colours: { text: "#ffffff", highlight: "#ffd60a", stroke: "#0b0b0f" },
    strokePx: 12,
    plate: null,
    effects: { highlight: true, popInMs: 140 },
  },
  broadcast: {
    id: "broadcast",
    font: {
      family: FONT_STACK,
      weight: 600,
      sizePx: 68,
      lineHeight: 1.18,
      charWidthEm: 0.48,
      letterSpacingEm: 0,
      uppercase: false,
    },
    colours: { text: "#f4f6fb", highlight: "#4cc9f0", stroke: "#000000" },
    strokePx: 0,
    plate: {
      colour: "#0a1630",
      opacity: 0.86,
      radiusPx: 18,
      padXPx: 28,
      padYPx: 16,
    },
    effects: { highlight: true, popInMs: 0 },
  },
  chalk: {
    id: "chalk",
    font: {
      family: FONT_STACK,
      weight: 800,
      sizePx: 76,
      lineHeight: 1.1,
      charWidthEm: 0.5,
      letterSpacingEm: 0.02,
      uppercase: false,
    },
    colours: { text: "#f2efe6", highlight: "#7ae582", stroke: "#1b2a1f" },
    strokePx: 8,
    plate: null,
    effects: { highlight: false, popInMs: 220 },
  },
}

export const isThemeId = (value: unknown): value is ThemeId =>
  THEME_IDS.some((id) => id === value)
