/**
 * The landing in the repo's own themes (C1184): every session theme
 * `@some-ui/styles` offers (`SESSION_THEMES`), its colours resolved from that
 * package's CSS where the site is built (`sessionColours`), so the page keeps
 * no palette of its own. The reader's device picks the brand's light or dark
 * theme, and a picker with no script (radios, applied with `:has()`) lets
 * them try any other; the page keeps nothing about the choice. Pure: the
 * resolved colours in, the CSS and the picker out.
 */
import type {
  SessionTheme,
  SessionThemeId,
} from "@some-ui/styles/theme/registry"

/** The theme roles the landing reads, as `@some-ui/styles` names them. */
export const THEME_ROLES = [
  "--background",
  "--foreground",
  "--card",
  "--muted",
  "--muted-foreground",
  "--primary",
  "--primary-foreground",
  "--chart-1",
  "--chart-2",
  "--destructive",
] as const

type ThemeRole = (typeof THEME_ROLES)[number]

/** A session theme as the landing wears it: each role resolved, as `#rrggbb`. */
export type LandingTheme = {
  readonly id: SessionThemeId
  readonly label: string
  readonly mode: "light" | "dark"
  readonly colours: Readonly<Record<ThemeRole, string>>
}

/**
 * A theme's roles from what its resolver gave (`sessionColours`), refused
 * when one is missing.
 */
function rolesFrom(
  resolved: Readonly<Record<string, string | undefined>>
): Readonly<Record<ThemeRole, string>> {
  const role = (name: ThemeRole): string => {
    const value = resolved[name]
    if (value === undefined) throw new Error(`no ${name} resolved`)
    return value
  }
  return {
    "--background": role("--background"),
    "--foreground": role("--foreground"),
    "--card": role("--card"),
    "--muted": role("--muted"),
    "--muted-foreground": role("--muted-foreground"),
    "--primary": role("--primary"),
    "--primary-foreground": role("--primary-foreground"),
    "--chart-1": role("--chart-1"),
    "--chart-2": role("--chart-2"),
    "--destructive": role("--destructive"),
  }
}

/**
 * The session themes as the landing wears them, each one's roles read
 * through `colours` (`sessionColours` where the site is built).
 */
export function landingThemes(
  sessions: ReadonlyArray<SessionTheme & { readonly id: SessionThemeId }>,
  colours: (
    id: SessionThemeId,
    roles: typeof THEME_ROLES
  ) => Readonly<Record<string, string | undefined>>
): ReadonlyArray<LandingTheme> {
  return sessions.map((theme) => ({
    id: theme.id,
    label: theme.label,
    mode: theme.mode,
    colours: rolesFrom(colours(theme.id, THEME_ROLES)),
  }))
}

/** The themes a reader's device setting picks: the brand's own, light and dark. */
export const DEVICE_THEMES = {
  light: "mochi",
  dark: "mochi-night",
} as const satisfies Readonly<Record<"light" | "dark", SessionThemeId>>

/**
 * The landing's own names for a theme's roles. A screen (where a clip plays)
 * is the theme's darkest ground: its ink on a light theme, its background on
 * a dark one, with the other as its text. A line is mixed from ink and
 * ground in the page's CSS, not read from `--border`, which some themes
 * write with an alpha the build's resolver drops.
 */
function declarations(theme: LandingTheme): string {
  const c = theme.colours
  const light = theme.mode === "light"
  return [
    `color-scheme: ${theme.mode};`,
    `--bg: ${c["--background"]};`,
    `--fg: ${c["--foreground"]};`,
    `--card: ${c["--card"]};`,
    `--stage: ${c["--muted"]};`,
    `--muted: ${c["--muted-foreground"]};`,
    `--accent: ${c["--primary"]};`,
    `--accent-fg: ${c["--primary-foreground"]};`,
    `--chart-a: ${c["--chart-1"]};`,
    `--chart-b: ${c["--chart-2"]};`,
    // A hug's heart (C1187): the theme's one red.
    `--heart: ${c["--destructive"]};`,
    `--screen: ${light ? c["--foreground"] : c["--background"]};`,
    `--screen-fg: ${light ? c["--background"] : c["--foreground"]};`,
  ].join(" ")
}

/** The radio that picks `id`, by its element id. */
const pickId = (id: SessionThemeId | "device"): string => `theme-${id}`

/**
 * The page's colours: the device's theme by default, and the one a reader
 * picks over it. Refuses a set without the device's two themes.
 */
export function themeCss(themes: ReadonlyArray<LandingTheme>): string {
  const of = (id: SessionThemeId): LandingTheme => {
    const theme = themes.find((t) => t.id === id)
    if (theme === undefined) throw new Error(`the landing needs theme ${id}`)
    return theme
  }
  return [
    `:root { ${declarations(of(DEVICE_THEMES.light))} }`,
    `@media (prefers-color-scheme: dark) { :root { ${declarations(of(DEVICE_THEMES.dark))} } }`,
    ...themes.map(
      (t) => `:root:has(#${pickId(t.id)}:checked) { ${declarations(t)} }`
    ),
  ].join("\n      ")
}

/** Text into HTML, as text (render.ts's `e`). */
type Escape = (text: string) => string

/**
 * The picker as the site draws it: the session themes, and the two icons the
 * app's own theme switcher shows (components/theme-switcher.tsx: lucide's
 * Palette on its button, Monitor beside "System"), drawn where the site is
 * built so the page and the app wear the same marks.
 */
export type ThemePicker = {
  readonly themes: ReadonlyArray<LandingTheme>
  readonly icons: { readonly palette: string; readonly device: string }
}

/**
 * The picker: a disclosure of radios behind the palette icon, one a theme,
 * the first following the device. Each theme shows its ground and accent
 * beside its name; the device's shows the monitor.
 */
export function themePicker(
  { themes, icons }: ThemePicker,
  words: { readonly theme: string; readonly themeDevice: string },
  e: Escape
): string {
  const swatch = (from: string, to: string): string =>
    `<span class="swatch" aria-hidden="true" style="--sw-bg: ${from}; --sw-fg: ${to}"></span>`
  const option = (
    id: SessionThemeId | "device",
    label: string,
    mark: string
  ): string =>
    // autocomplete off: a browser restoring the last pick on reload would
    // keep something about the reader.
    `<label><input type="radio" name="theme" id="${pickId(id)}" autocomplete="off"${id === "device" ? " checked" : ""} />${mark}<span>${e(label)}</span></label>`
  return `<details class="themes">
          <summary title="${e(words.theme)}"><span class="theme-icon" aria-hidden="true">${icons.palette}</span><span class="theme-name">${e(words.theme)}</span></summary>
          <fieldset>
            <legend>${e(words.theme)}</legend>
            ${[
              option(
                "device",
                words.themeDevice,
                `<span class="swatch swatch--icon" aria-hidden="true">${icons.device}</span>`
              ),
              ...themes.map((t) =>
                option(
                  t.id,
                  t.label,
                  swatch(t.colours["--background"], t.colours["--primary"])
                )
              ),
            ].join("\n            ")}
          </fieldset>
        </details>`
}
