import type { CubeState, CubeTheme, FaceState } from "@conveyor/types"

// ─── Structural layout classes ──────────────────────────────────────────────────
// Static box/layout for the cube + faces, authored as @some-ui/styles preset
// utilities (compiled to plain CSS by @unocss/cli). They live here — not inline in
// the renderer — because `CubeRenderer.applyState` rewrites `cube.className` /
// `face.className` from `cubeClass()` / `faceClass()` every frame, so the layout
// has to travel with the theme class string to survive those resets. Colors,
// preserve-3d, backface-visibility, fonts and state/effect rules stay in
// `styles/conveyor.css` (themeable custom props / no utility equivalent).
export const SC_CUBE_LAYOUT = "relative h-full w-full"
export const SC_FACE_LAYOUT =
  "absolute inset-0 flex items-center justify-center overflow-hidden box-border"

// ─── Steel theme ─────────────────────────────────────────────────────────────

/**
 * SteelTheme
 *
 * Aesthetic direction: machined steel transport surface (the design "floor").
 * A steel substrate with restrained semantic accents — signal (scheduler tick /
 * caution), live (in-window / online), alert (failed / down) — and
 * instrumentation typography.
 *
 * Values reference the shared `--cv-*` conveyor tokens, which are the canonical
 * palette in `@some-ui/styles/themes/conveyor.css` and are surfaced into the
 * shadow scope on `:host` in `styles/conveyor.css`. This keeps colour/type
 * decisions in the shared design system (invariant #1) — the theme object only
 * maps the shared tokens onto the cube/face/strip custom-property contract.
 */
export const SteelTheme: CubeTheme = {
  name: "steel",

  cssVariables: {
    "--conveyor-bg": "transparent",
    "--cube-bg": "var(--cv-steel-700)",
    "--cube-border": "var(--cv-line)",
    "--cube-border-active": "var(--cv-signal)",
    "--cube-shadow": "0 0 24px rgb(0 0 0 / 45%)",
    "--face-bg":
      "linear-gradient(155deg, var(--cv-steel-650), var(--cv-steel-600) 55%, var(--cv-steel-700))",
    "--face-bg-active":
      "linear-gradient(155deg, var(--cv-steel-600), var(--cv-steel-550) 55%, var(--cv-steel-650))",
    "--face-border": "var(--cv-steel-550)",
    "--face-border-active": "var(--cv-signal)",
    "--face-glow-active": "0 0 12px rgb(244 183 64 / 12%)",
    "--face-text": "var(--cv-ink-2)",
    "--face-text-active": "var(--cv-ink)",
    "--face-text-secondary": "var(--cv-ink-3)",
    "--face-font": "'Inter', ui-sans-serif, system-ui, sans-serif",
    "--face-font-size": "13px",
    "--face-line-height": "1.3",
    "--transition-duration": "500ms",
    "--transition-easing": "cubic-bezier(0.2, 0.7, 0.2, 1)",
    "--strip-bg": "rgb(16 20 27 / 92%)",
    "--strip-border-top": "1px solid var(--cv-line)",
    "--strip-backdrop": "blur(8px)",
    "--hover-speed-factor": "0.25",
  },

  faceClass(state: FaceState): string {
    const classes: Array<string> = ["sc-face", SC_FACE_LAYOUT]
    if (state.isActive) classes.push("sc-face--active")
    if (state.isHovered) classes.push("sc-face--hovered")
    return classes.join(" ")
  },

  cubeClass(state: CubeState): string {
    const classes: Array<string> = ["sc-cube", SC_CUBE_LAYOUT]
    if (state.attentionMode === "Suspended") classes.push("sc-cube--suspended")
    if (state.attentionMode === "Reduced") classes.push("sc-cube--reduced")
    return classes.join(" ")
  },

  transitionDuration: 500,
} as const

/**
 * CONVEYOR_TOKENS — the canonical steel palette + brand fonts as inline style
 * props, for Storybook surfaces that render OUTSIDE the shadow root (where the
 * `:host` block in styles/conveyor.css does not apply). Mirrors that block;
 * source of truth remains @some-ui/styles/themes/conveyor.css.
 */
export const CONVEYOR_TOKENS: Readonly<Record<string, string>> = {
  "--cv-steel-950": "#0a0d12",
  "--cv-steel-900": "#0c0f14",
  "--cv-steel-850": "#10141b",
  "--cv-steel-800": "#141922",
  "--cv-steel-700": "#1a2029",
  "--cv-steel-650": "#212834",
  "--cv-steel-600": "#28313e",
  "--cv-steel-550": "#323d4c",
  "--cv-line": "#39444f",
  "--cv-ink": "#849bb4",
  "--cv-ink-2": "#657689",
  "--cv-ink-3": "#414f5d",
  "--cv-signal": "#f4b740",
  "--cv-live": "#5fd1bb",
  "--cv-alert": "#e8745c",
  "--font-display": "'Space Grotesk', 'Inter', ui-sans-serif, sans-serif",
  "--font-sans": "'Inter', ui-sans-serif, system-ui, sans-serif",
  "--font-mono":
    "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', 'Menlo', monospace",
} as const

// ─── ThemeEngine ───────────────────────────────────────────────────────────────

/**
 * ThemeEngine
 *
 * Registry of named CubeTheme objects. Applies a theme to a DOM element
 * by injecting CSS custom properties.
 *
 * This is the ONLY place in the codebase that knows about colors, shadows,
 * fonts, or any visual property. Everything else works with class names and
 * CSS variables.
 *
 * Swapping themes is a data substitution — no JS logic changes required.
 */
export class ThemeEngine {
  private readonly registry = new Map<string, CubeTheme>()
  private activeThemeName: string

  constructor(defaultTheme: CubeTheme = SteelTheme) {
    this.registry.set(defaultTheme.name, defaultTheme)
    this.activeThemeName = defaultTheme.name
  }

  register(theme: CubeTheme): void {
    this.registry.set(theme.name, theme)
  }

  get activeTheme(): CubeTheme {
    return this.registry.get(this.activeThemeName) ?? SteelTheme
  }

  setActive(name: string): boolean {
    if (!this.registry.has(name)) return false
    this.activeThemeName = name
    return true
  }

  /**
   * Inject all CSS variables from the active theme onto the given element.
   * Called once at cube construction and again on theme switch.
   */
  applyToElement(el: HTMLElement, theme: CubeTheme = this.activeTheme): void {
    for (const [prop, value] of Object.entries(theme.cssVariables)) {
      el.style.setProperty(prop, value)
    }
  }

  /**
   * Remove all CSS variables belonging to a theme from the given element.
   * Call before applying a new theme to avoid stale variables.
   */
  removeFromElement(el: HTMLElement, theme: CubeTheme): void {
    for (const prop of Object.keys(theme.cssVariables)) {
      el.style.removeProperty(prop)
    }
  }

  listThemes(): Array<string> {
    return Array.from(this.registry.keys())
  }
}
