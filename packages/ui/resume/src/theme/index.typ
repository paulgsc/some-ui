// Theme tokens. A theme is pure data: no layout, no content. Templates read
// these names and nothing else, so a new palette is a new entry here rather
// than an edit spread across the templates.
//
// This is also the seam the eventual server-side renderer configures per
// request — keep every visual constant that a caller might want to override in
// this file rather than inline in a template.

#let themes = (
  teal: (
    accent: rgb("#0c6f70"),
    accent-soft: rgb("#00a8ad"),
    accent-deep: rgb("#08585a"),
    ink: rgb("#2f3437"),
    muted: rgb("#63696d"),
    rule: rgb("#c3c8cb"),
    rail-ink: rgb("#ffffff"),
    rail-muted: rgb("#c9e4e5"),
    rail-rule: rgb("#5fa3a4"),
    rail-fill: rgb("#0c6f70"),
    avatar-fill: rgb("#08585a"),
    avatar-ring: rgb("#8ac6c7"),
    page-fill: rgb("#ffffff"),
  ),
  slate: (
    accent: rgb("#334155"),
    accent-soft: rgb("#3f7ea6"),
    accent-deep: rgb("#1e293b"),
    ink: rgb("#1f2937"),
    muted: rgb("#5b6672"),
    rule: rgb("#c4cbd3"),
    rail-ink: rgb("#ffffff"),
    rail-muted: rgb("#cbd6e2"),
    rail-rule: rgb("#7d8ea3"),
    rail-fill: rgb("#334155"),
    avatar-fill: rgb("#1e293b"),
    avatar-ring: rgb("#9fb2c8"),
    page-fill: rgb("#ffffff"),
  ),
  ink: (
    accent: rgb("#1a1a1a"),
    accent-soft: rgb("#444444"),
    accent-deep: rgb("#000000"),
    ink: rgb("#1a1a1a"),
    muted: rgb("#565656"),
    rule: rgb("#b0b0b0"),
    rail-ink: rgb("#1a1a1a"),
    rail-muted: rgb("#565656"),
    rail-rule: rgb("#b0b0b0"),
    rail-fill: rgb("#f1f1f1"),
    avatar-fill: rgb("#e2e2e2"),
    avatar-ring: rgb("#9a9a9a"),
    page-fill: rgb("#ffffff"),
  ),
)

#let resolve-theme(name) = themes.at(name, default: themes.teal)

// Font stacks a template may select. The families here must be provisioned by
// scripts/fonts.mjs — typst is run with system fonts ignored, so a name that
// isn't in the pinned set renders as a fallback box rather than silently
// picking up a lookalike from the host.
#let fonts = (
  lato: "Lato",
  "pt-serif": "PT Serif",
)

#let resolve-font(name) = fonts.at(name, default: fonts.lato)
