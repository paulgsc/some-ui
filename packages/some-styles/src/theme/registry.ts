/**
 * The canonical theme registry — one source of truth for every theme selector
 * this package ships in CSS.
 *
 * There used to be two registries with different schemas and different
 * membership: `theme/registry.ts` listed the four palettes a user can persist,
 * and `preset/themes.ts` listed every class selector shipped in CSS. Both were
 * called "themes" and both were exported from the package root, so each
 * consumer picked whichever interpretation was locally convenient — Storybook
 * took the exhaustive one, apps/www took the small one, and
 * `strawberry-moon` / `peachy-blossom` existed in both with different metadata.
 * That ambiguity is the reason nothing could state, and therefore nothing could
 * enforce, what a reusable component is allowed to do with a theme.
 *
 * The shapes are genuinely different, so they are named rather than merged,
 * and {@link ThemeScope} is the distinction that matters to a component author:
 *
 * - `session` — a full palette applied to the *document root* by the host
 *   adapter, chosen and persisted by the user. Reusable components must never
 *   apply one.
 * - `feature` — a full standalone palette applied to a *nested* boundary. It
 *   replaces `--background` / `--foreground` / … for its subtree, so it is
 *   opt-in art direction, never a component's own default.
 * - `accent`  — layers a `--primary` family onto `.theme-container` without
 *   touching the substrate. Composes with any session theme.
 * - `component` — a namespaced skin that declares only its own `--*` tokens
 *   and never touches the semantic contract. A component may apply one to
 *   itself: doing so cannot shadow the user's theme, which is the whole
 *   property the other scopes lack. This is also the shape `feature` themes
 *   should migrate toward — `.code` owning `--code-canvas` rather than
 *   reassigning `--background` — at which point they stop being an override
 *   and become composable.
 *
 * Every consumer — the controller, `preset/themes.ts`, apps/www's switcher,
 * the Storybook toolbar — reads a derived view of these arrays. Nothing
 * maintains a second list.
 */

/** Native `color-scheme` a theme reports; `inherit` leaves it to the host. */
export type ThemeMode = "light" | "dark" | "inherit"

export type ThemeScope = "session" | "feature" | "accent" | "component"

/**
 * How a theme is carried in the DOM. The full contract is:
 *
 * - `classNames` go on the boundary element (the document root for `session`,
 *   any element for `feature`, a `.theme-container` ancestor for `accent`).
 * - `dataTheme` is mirrored to a data attribute for CSS hooks and test
 *   assertions.
 * - a `session` boundary additionally sets `style.color-scheme` from `mode`.
 *
 * Tokens then reach components purely by CSS inheritance — there is no
 * runtime, no context, and no framework anywhere in this path.
 */
export type ThemeBoundary = {
  classNames: ReadonlyArray<string>
  dataTheme: string
}

export type ThemeSwatch = {
  /** Background sample. */
  bg: string
  /** Foreground / text sample. */
  fg: string
  /** Primary / accent sample. */
  accent: string
}

export type ThemeDefinition = {
  /** Stable id — persisted as the user's preference for `session` themes. */
  id: string
  /** Human label for switchers and toolbars. */
  label: string
  mode: ThemeMode
  scope: ThemeScope
  boundary: ThemeBoundary
  /**
   * Whether this theme may be offered in a user-facing session switcher. Only
   * `session` themes are selectable; a feature appearance is chosen by the
   * host that composes it, not by the person using the app.
   */
  selectable: boolean
  /** Preview chip colors. Present for everything a switcher can render. */
  swatch?: ThemeSwatch
}

/**
 * A session theme — a full palette on the document root that the user picks.
 * Narrower than {@link ThemeDefinition}: `mode` is always concrete, because
 * applying one sets native `color-scheme`.
 */
export type SessionTheme = ThemeDefinition & {
  scope: "session"
  mode: "light" | "dark"
  selectable: true
  swatch: ThemeSwatch
}

/** The palettes a user can select and persist. Applied to the document root. */
export const SESSION_THEMES = [
  {
    id: "light",
    label: "Light",
    mode: "light",
    scope: "session",
    boundary: { classNames: [], dataTheme: "light" },
    selectable: true,
    swatch: {
      bg: "oklch(1 0 0)",
      fg: "oklch(0.145 0 0)",
      accent: "oklch(0.205 0 0)",
    },
  },
  {
    id: "dark",
    label: "Dark",
    mode: "dark",
    scope: "session",
    boundary: { classNames: ["dark"], dataTheme: "dark" },
    selectable: true,
    swatch: {
      bg: "oklch(0.145 0 0)",
      fg: "oklch(0.9 0.004 260)",
      accent: "oklch(0.922 0 0)",
    },
  },
  {
    // `dark` rides along so shared `.dark` component styles resolve beside the
    // standalone palette class.
    id: "strawberry-moon",
    label: "Strawberry Moon",
    mode: "dark",
    scope: "session",
    boundary: {
      classNames: ["dark", "strawberry-moon"],
      dataTheme: "strawberry-moon",
    },
    selectable: true,
    swatch: {
      bg: "oklch(0.16 0.03 350)",
      fg: "oklch(0.88 0.02 350)",
      accent: "oklch(0.68 0.19 15)",
    },
  },
  {
    id: "peachy-blossom",
    label: "Peachy Blossom",
    mode: "light",
    scope: "session",
    boundary: { classNames: ["peachy-blossom"], dataTheme: "peachy-blossom" },
    selectable: true,
    swatch: {
      bg: "oklch(0.98 0.02 60)",
      fg: "oklch(0.34 0.04 40)",
      accent: "oklch(0.74 0.16 25)",
    },
  },
] as const satisfies ReadonlyArray<SessionTheme>

/**
 * Nested, opt-in palettes a host may compose onto a subtree. Never
 * user-selectable, and never a reusable component's own default — a component
 * that wants one takes it as an explicit `appearance` prop.
 */
export const FEATURE_APPEARANCES = [
  {
    id: "scheduler",
    label: "Scheduler",
    mode: "dark",
    scope: "feature",
    boundary: { classNames: ["scheduler"], dataTheme: "scheduler" },
    selectable: false,
  },
  {
    id: "code",
    label: "Code",
    mode: "dark",
    scope: "feature",
    boundary: { classNames: ["code"], dataTheme: "code" },
    selectable: false,
  },
  {
    id: "cdrama",
    label: "C-Drama",
    mode: "light",
    scope: "feature",
    boundary: { classNames: ["cdrama"], dataTheme: "cdrama" },
    selectable: false,
  },
  {
    id: "topik",
    label: "Topik",
    mode: "light",
    scope: "feature",
    boundary: { classNames: ["topik"], dataTheme: "topik" },
    selectable: false,
  },
  {
    id: "conveyor",
    label: "Conveyor",
    mode: "dark",
    scope: "feature",
    boundary: { classNames: ["conveyor"], dataTheme: "conveyor" },
    selectable: false,
  },
] as const satisfies ReadonlyArray<ThemeDefinition>

/**
 * Namespaced component skins. Unlike a feature appearance these declare only
 * their own private tokens — `.headline` owns `--base-bg`, `--light-a`,
 * `--text-main` and nothing else — so a component is free to apply one to its
 * own root. It cannot shadow `--background` / `--foreground`, so the user's
 * session theme still reaches everything around and inside it.
 *
 * Registered here rather than left unlisted because the `theme-protocol` lint
 * rule has to tell the two apart: `.code` on a component root is the bug this
 * whole protocol exists to prevent, and `.headline` on a component root is
 * correct.
 */
export const COMPONENT_SKINS = [
  {
    id: "headline",
    label: "Headline",
    mode: "dark",
    scope: "component",
    boundary: { classNames: ["headline"], dataTheme: "headline" },
    selectable: false,
  },
] as const satisfies ReadonlyArray<ThemeDefinition>

/**
 * `--primary`-family overlays. Unlike the two scopes above these do not touch
 * the substrate, so they compose with whatever session theme is active — which
 * is why their `mode` is `inherit`.
 */
export const ACCENT_THEMES: ReadonlyArray<ThemeDefinition> = (
  [
    ["default", "Default"],
    ["blue", "Blue"],
    ["green", "Green"],
    ["amber", "Amber"],
    ["rose", "Rose"],
    ["purple", "Purple"],
    ["orange", "Orange"],
    ["teal", "Teal"],
    ["red", "Red"],
    ["yellow", "Yellow"],
    ["violet", "Violet"],
    ["mono", "Mono"],
    ["scaled", "Scaled"],
  ] as const
).map(([id, label]) => ({
  id: `theme-${id}`,
  label,
  mode: "inherit" as const,
  scope: "accent" as const,
  boundary: { classNames: [`theme-${id}`], dataTheme: `theme-${id}` },
  selectable: false,
}))

/** Every theme selector shipped in CSS, in one list. */
export const THEMES: ReadonlyArray<ThemeDefinition> = [
  ...SESSION_THEMES,
  ...FEATURE_APPEARANCES,
  ...COMPONENT_SKINS,
  ...ACCENT_THEMES,
]

/**
 * The classes a reusable component must never author on its own root: they
 * replace the semantic contract for their subtree, so a component that mounts
 * one has opted its users out of the theme they chose. Consumed by the
 * `theme-protocol` ESLint rule.
 */
export const BOUNDARY_OVERRIDE_CLASSES: ReadonlyArray<string> = Array.from(
  new Set(
    [...SESSION_THEMES, ...FEATURE_APPEARANCES].flatMap(
      (t) => t.boundary.classNames
    )
  )
)

export type SessionThemeId = (typeof SESSION_THEMES)[number]["id"]
export type FeatureAppearanceId = (typeof FEATURE_APPEARANCES)[number]["id"]

export const SESSION_THEME_IDS: ReadonlyArray<SessionThemeId> =
  SESSION_THEMES.map((t) => t.id)

export const FEATURE_APPEARANCE_IDS: ReadonlyArray<FeatureAppearanceId> =
  FEATURE_APPEARANCES.map((t) => t.id)

/**
 * Every root class a *session* theme can add — the set the controller clears
 * before applying the next one. Derived, so adding a session theme with a new
 * class can never leave a stale class behind on the root.
 *
 * Deliberately not the union of all scopes: feature and accent classes live on
 * nested boundaries owned by whoever mounted them, and the session controller
 * has no business removing them from the root.
 */
export const SESSION_THEME_CLASSES: ReadonlyArray<string> = Array.from(
  new Set(SESSION_THEMES.flatMap((t) => t.boundary.classNames))
)

/**
 * Every class this package ships, across all scopes. Used by tooling that has
 * to recognise a theme class wherever it appears — notably the
 * `theme-protocol` ESLint rule, which flags any of these authored inside a
 * reusable component.
 */
export const ALL_THEME_CLASSES: ReadonlyArray<string> = Array.from(
  new Set(THEMES.flatMap((t) => t.boundary.classNames))
)

export function getTheme(id: string): ThemeDefinition | undefined {
  return THEMES.find((t) => t.id === id)
}

export function getSessionTheme(id: string): SessionTheme | undefined {
  return SESSION_THEMES.find((t) => t.id === id)
}

export function getFeatureAppearance(id: string): ThemeDefinition | undefined {
  return FEATURE_APPEARANCES.find((t) => t.id === id)
}

export function getComponentSkin(id: string): ThemeDefinition | undefined {
  return COMPONENT_SKINS.find((t) => t.id === id)
}
