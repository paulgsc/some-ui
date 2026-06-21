import type { UserShortcuts } from "unocss"

/**
 * shadcn-flavored component shortcuts.
 *
 * These are the "style classnames" extensions reach for instead of
 * hand-writing vanilla CSS: rounded by default, consistent focus rings,
 * token-driven colors. They eliminate the per-extension reinvention of
 * buttons / cards / inputs that leads to colliding, duplicated styles.
 *
 * Each shortcut expands to atomic utilities at build time, so the runtime
 * output is plain CSS — no engine, no class-name lookup table.
 */
export const shortcuts: UserShortcuts = {
  // ── Buttons ────────────────────────────────────────────────────────────
  btn: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  "btn-default": "btn h-9 px-4 py-2",
  "btn-primary":
    "btn-default bg-primary text-primary-foreground hover:bg-primary/90",
  "btn-secondary":
    "btn-default bg-secondary text-secondary-foreground hover:bg-secondary/80",
  "btn-destructive":
    "btn-default bg-destructive text-destructive-foreground hover:bg-destructive/90",
  "btn-outline":
    "btn-default border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  "btn-ghost": "btn-default hover:bg-accent hover:text-accent-foreground",
  "btn-link": "btn-default text-primary underline-offset-4 hover:underline",
  "btn-sm": "h-8 rounded-md px-3 text-xs",
  "btn-lg": "h-10 rounded-md px-6",
  "btn-icon": "h-9 w-9 p-0",

  // ── Card ───────────────────────────────────────────────────────────────
  card: "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
  "card-header": "flex flex-col gap-1.5 p-6",
  "card-title": "text-lg font-semibold leading-none tracking-tight",
  "card-description": "text-sm text-muted-foreground",
  "card-content": "p-6 pt-0",
  "card-footer": "flex items-center p-6 pt-0",

  // ── Form controls ──────────────────────────────────────────────────────
  input:
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  label: "text-sm font-medium leading-none",

  // ── Badge ──────────────────────────────────────────────────────────────
  badge:
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  "badge-primary":
    "badge border-transparent bg-primary text-primary-foreground",
  "badge-secondary":
    "badge border-transparent bg-secondary text-secondary-foreground",
  "badge-destructive":
    "badge border-transparent bg-destructive text-destructive-foreground",
  "badge-outline": "badge text-foreground",

  // ── Surfaces / helpers ─────────────────────────────────────────────────
  surface: "bg-surface text-surface-foreground",
  muted: "bg-muted text-muted-foreground",
  separator: "shrink-0 bg-border h-px w-full",
  kbd: "inline-flex items-center rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground",
}
