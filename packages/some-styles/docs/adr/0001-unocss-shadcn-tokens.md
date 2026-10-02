# ADR 0001 — UnoCSS + shadcn token schema over pure Tailwind

- **Status:** Accepted
- **Date:** 2026-06-20

## Context

The some-ui monorepo needs a shared design system that covers: (1) utility classes for rapid UI development, (2) design tokens (colors, radius, spacing) shared across packages, and (3) component-level styles compatible with shadcn/ui components (which many packages adopt).

Tailwind CSS alone handles (1) but not (2) and (3) — shadcn components expect specific CSS custom property names (`--background`, `--foreground`, `--primary`, etc.) and a dark-mode switcher that works at the CSS layer.

## Decision

Use **UnoCSS** as the utility class engine (it processes Tailwind-compatible class names and our custom shortcuts) and adopt the **shadcn token schema** (CSS custom properties) as the design token layer. UnoCSS's `presetSomeUi` preset wraps both together.

Runtime output is plain static CSS (no JS shipped to browsers). The JS layer (`src/index.ts` exports) is dev-time only for config factories and TypeScript types.

## Trade-offs accepted

- UnoCSS is a less-common choice than Tailwind; new contributors must learn UnoCSS's config API.
- The shadcn token names must never be renamed (shadcn components have hard-coded custom property expectations). Breaking this constraint breaks all shadcn components in the monorepo.
- Some Tailwind-specific utilities (JIT arbitrary values) require UnoCSS equivalents which may differ.

## Alternatives rejected

- **Pure Tailwind with CSS variables:** Tailwind's JIT mode doesn't easily compose CSS custom properties as first-class design tokens. Rejected.
- **CSS Modules per package:** no shared token system; each package would define its own color palette. Rejected.
- **Full shadcn/ui with Tailwind CSS:** locks in Tailwind as the required build tool for all consumers. UnoCSS provides more flexibility. Rejected.
