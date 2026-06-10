import type { CubeState, CubeTheme, FaceState } from "@conveyor/types"

// ─── Terminal theme ────────────────────────────────────────────────────────────

/**
 * TerminalTheme
 *
 * Aesthetic direction: utilitarian instrumentation panel.
 * Dark background, phosphor-green active face, monospaced data readout.
 * Maximizes contrast over arbitrary vendor pages.
 * Zero decoration — communicates "this is data" not "this is UI".
 */
export const TerminalTheme: CubeTheme = {
  name: "terminal",

  cssVariables: {
    "--conveyor-bg": "transparent",
    "--cube-bg": "#0a0e0a",
    "--cube-border": "#1a2e1a",
    "--cube-border-active": "#00ff41",
    "--cube-shadow": "0 0 24px rgba(0, 255, 65, 0.08)",
    "--face-bg": "#0d120d",
    "--face-bg-active": "#0a1a0a",
    "--face-border": "#1c2e1c",
    "--face-border-active": "#00ff41",
    "--face-glow-active": "0 0 12px rgba(0, 255, 65, 0.35)",
    "--face-text": "#4a7c4a",
    "--face-text-active": "#00ff41",
    "--face-text-secondary": "#2a4a2a",
    "--face-font": "'Courier New', 'Courier', monospace",
    "--face-font-size": "11px",
    "--face-line-height": "1.5",
    "--transition-duration": "500ms",
    "--transition-easing": "cubic-bezier(0.4, 0, 0.2, 1)",
    "--strip-bg": "rgba(6, 10, 6, 0.92)",
    "--strip-border-top": "1px solid #1a2e1a",
    "--strip-backdrop": "blur(8px)",
    "--hover-speed-factor": "0.25",
  },

  faceClass(state: FaceState): string {
    const classes: Array<string> = ["sc-face"]
    if (state.isActive) classes.push("sc-face--active")
    if (state.isHovered) classes.push("sc-face--hovered")
    return classes.join(" ")
  },

  cubeClass(state: CubeState): string {
    const classes: Array<string> = ["sc-cube"]
    if (state.attentionMode === "Suspended") classes.push("sc-cube--suspended")
    if (state.attentionMode === "Reduced") classes.push("sc-cube--reduced")
    return classes.join(" ")
  },

  transitionDuration: 500,
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

  constructor(defaultTheme: CubeTheme = TerminalTheme) {
    this.registry.set(defaultTheme.name, defaultTheme)
    this.activeThemeName = defaultTheme.name
  }

  register(theme: CubeTheme): void {
    this.registry.set(theme.name, theme)
  }

  get activeTheme(): CubeTheme {
    return this.registry.get(this.activeThemeName) ?? TerminalTheme
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
