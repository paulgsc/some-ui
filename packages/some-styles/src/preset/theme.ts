/**
 * Maps the shadcn-style design tokens (defined as CSS custom properties in
 * `tokens/base.css`) onto the UnoCSS theme so they become first-class
 * utilities — `bg-primary`, `text-muted-foreground`, `border-border`, etc.
 *
 * Colors are wired to `var(--token)` rather than literal values, so a single
 * set of tokens drives every theme (light, dark, and the named app themes)
 * with zero duplicated utility output. presetWind4 applies opacity modifiers
 * via `color-mix`, so `bg-primary/90` works as expected.
 */

/** A token reference with its paired `-foreground` token. */
function pair(name: string): { DEFAULT: string; foreground: string } {
  return {
    DEFAULT: `var(--${name})`,
    foreground: `var(--${name}-foreground)`,
  }
}

export const colors = {
  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",

  background: "var(--background)",
  foreground: "var(--foreground)",

  primary: pair("primary"),
  secondary: pair("secondary"),
  muted: pair("muted"),
  accent: pair("accent"),
  destructive: pair("destructive"),
  card: pair("card"),
  popover: pair("popover"),
  surface: pair("surface"),
  selection: pair("selection"),
  code: {
    DEFAULT: "var(--code)",
    foreground: "var(--code-foreground)",
    highlight: "var(--code-highlight)",
    number: "var(--code-number)",
  },

  sidebar: {
    DEFAULT: "var(--sidebar)",
    foreground: "var(--sidebar-foreground)",
    primary: "var(--sidebar-primary)",
    "primary-foreground": "var(--sidebar-primary-foreground)",
    accent: "var(--sidebar-accent)",
    "accent-foreground": "var(--sidebar-accent-foreground)",
    border: "var(--sidebar-border)",
    ring: "var(--sidebar-ring)",
  },

  chart: {
    1: "var(--chart-1)",
    2: "var(--chart-2)",
    3: "var(--chart-3)",
    4: "var(--chart-4)",
    5: "var(--chart-5)",
  },
} as const

/**
 * Radius scale derived from the single `--radius` token. Every rounded
 * utility resolves through this, so components are never accidentally
 * sharp-cornered and a theme can restyle all radii by changing one token.
 */
export const radius = {
  DEFAULT: "var(--radius)",
  none: "0",
  sm: "calc(var(--radius) - 4px)",
  md: "calc(var(--radius) - 2px)",
  lg: "var(--radius)",
  xl: "calc(var(--radius) + 4px)",
  "2xl": "calc(var(--radius) + 8px)",
  full: "9999px",
} as const

/**
 * Font families wired to the single `--font-*` tokens (tokens/base.css),
 * so `font-sans` / `font-mono` / `font-display` resolve through the same
 * indirection as colors. A theme overriding a token (e.g. `.conveyor`
 * pointing `--font-mono` at IBM Plex Mono) restyles the utility with no
 * duplicated output. `display` is the additive brand/heading family.
 *
 * presetWind4 keys font families under `theme.font` (each `font-<key>`
 * utility emits `font-family: var(--font-<key>)`); this deep-merges with
 * Wind's defaults to add the `display` family alongside sans/mono.
 */
export const fontFamily = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
  display: "var(--font-display)",
} as const

export const someUiTheme = {
  colors,
  radius,
  font: fontFamily,
}
