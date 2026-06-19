import type { ReactNode } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

/**
 * Living catalog for `@some-ui/styles`.
 *
 * Everything here is authored with the UnoCSS preset (shortcuts + utilities)
 * and resolves against the shared design tokens. Use the toolbar (Mode /
 * Theme) to see the same components re-skin across light/dark and every
 * registered theme — proving the token system end to end.
 */
const meta: Meta = {
  title: "Design System/Styles",
  parameters: {
    layout: "fullscreen",
  },
}

export default meta

type Story = StoryObj

const colorTokens = [
  "background",
  "foreground",
  "primary",
  "secondary",
  "muted",
  "accent",
  "destructive",
  "card",
  "popover",
  "border",
  "input",
  "ring",
  "surface",
  "sidebar",
] as const

const chartTokens = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]

const Section = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h2>
    {children}
  </section>
)

export const Buttons: Story = {
  render: () => (
    <Section title="Buttons">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary">Primary</button>
        <button className="btn-secondary">Secondary</button>
        <button className="btn-outline">Outline</button>
        <button className="btn-ghost">Ghost</button>
        <button className="btn-destructive">Destructive</button>
        <button className="btn-link">Link</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary btn-sm">Small</button>
        <button className="btn-primary">Default</button>
        <button className="btn-primary btn-lg">Large</button>
        <button className="btn-outline btn-icon" aria-label="icon">
          ★
        </button>
        <button className="btn-primary" disabled>
          Disabled
        </button>
      </div>
    </Section>
  ),
}

export const Badges: Story = {
  render: () => (
    <Section title="Badges">
      <div className="flex flex-wrap items-center gap-3">
        <span className="badge-primary">Primary</span>
        <span className="badge-secondary">Secondary</span>
        <span className="badge-outline">Outline</span>
        <span className="badge-destructive">Destructive</span>
        <kbd className="kbd">⌘K</kbd>
      </div>
    </Section>
  ),
}

export const Card: Story = {
  render: () => (
    <Section title="Card">
      <div className="card max-w-sm">
        <div className="card-header">
          <h3 className="card-title">Card title</h3>
          <p className="card-description">
            A rounded, token-driven surface — no sharp corners.
          </p>
        </div>
        <div className="card-content flex flex-col gap-3">
          <label className="label" htmlFor="catalog-email">
            Email
          </label>
          <input
            id="catalog-email"
            className="input"
            placeholder="you@example.com"
          />
        </div>
        <div className="card-footer gap-2">
          <button className="btn-primary btn-sm">Save</button>
          <button className="btn-ghost btn-sm">Cancel</button>
        </div>
      </div>
    </Section>
  ),
}

export const Tokens: Story = {
  render: () => (
    <Section title="Color tokens">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
        {colorTokens.map((name) => (
          <div key={name} className="flex flex-col gap-1.5">
            <div
              className="h-14 w-full rounded-md border border-border"
              style={{ background: `var(--${name})` }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {name}
            </span>
          </div>
        ))}
      </div>
      <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Charts
      </h2>
      <div className="flex flex-wrap gap-3">
        {chartTokens.map((name) => (
          <div key={name} className="flex flex-col items-center gap-1.5">
            <div
              className="size-12 rounded-full"
              style={{ background: `var(--${name})` }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {name}
            </span>
          </div>
        ))}
      </div>
    </Section>
  ),
}

// Full class strings (not interpolated) so UnoCSS can statically extract them.
const radii = [
  { label: "rounded-sm", box: "size-16 bg-primary rounded-sm" },
  { label: "rounded-md", box: "size-16 bg-primary rounded-md" },
  { label: "rounded-lg", box: "size-16 bg-primary rounded-lg" },
  { label: "rounded-xl", box: "size-16 bg-primary rounded-xl" },
  { label: "rounded-2xl", box: "size-16 bg-primary rounded-2xl" },
]

export const Radius: Story = {
  render: () => (
    <Section title="Radius scale">
      <div className="flex flex-wrap items-end gap-4">
        {radii.map((r) => (
          <div key={r.label} className="flex flex-col items-center gap-1.5">
            <div className={r.box} />
            <span className="font-mono text-xs text-muted-foreground">
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </Section>
  ),
}
