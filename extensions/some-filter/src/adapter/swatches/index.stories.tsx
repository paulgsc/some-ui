import type { Meta, StoryObj } from "@storybook/react-vite"

import {
  comfortReport,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
  type Swatch,
} from "."

/**
 * Living catalog of the swatch registry (`SWATCHES`) — every dark-palette
 * option `some-filter` can apply, plus the Φ_comfort verdict each one ships
 * with (see this module's own header comment for the argument behind it).
 */
const meta: Meta = {
  title: "Extensions/TabFilter/Adapter/Swatches",
  parameters: { layout: "fullscreen", backgrounds: { default: "dark" } },
}
export default meta

type Story = StoryObj

const chips: Array<{ label: string; key: keyof Swatch }> = [
  { label: "bg0", key: "bg0" },
  { label: "bg1", key: "bg1" },
  { label: "bg2", key: "bg2" },
  { label: "bg3", key: "bg3" },
  { label: "surface", key: "surface" },
  { label: "border", key: "border" },
  { label: "text0", key: "text0" },
  { label: "text1", key: "text1" },
  { label: "text2", key: "text2" },
  { label: "link", key: "link" },
  { label: "linkVisited", key: "linkVisited" },
  { label: "inputBg", key: "inputBg" },
  { label: "inputBorder", key: "inputBorder" },
  { label: "selectionBg", key: "selectionBg" },
  { label: "codeFg", key: "codeFg" },
]

const ColorChip = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div
      style={{
        height: 40,
        width: "100%",
        borderRadius: 6,
        background: value,
        border: "1px solid rgba(255, 255, 255, 0.15)",
      }}
    />
    <span style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.75 }}>
      {label}
    </span>
  </div>
)

const SwatchCard = ({ swatch }: { swatch: Swatch }) => {
  const comfortable = satisfiesComfort(swatchSample(swatch))
  const report = comfortReport(swatchSample(swatch))

  return (
    <div
      style={{
        background: swatch.bg0,
        color: swatch.text0,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{swatch.label}</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.7 }}>
            {swatch.id}
          </div>
        </div>
        <span
          title={Object.entries(report)
            .map(([clause, pass]) => `${clause}: ${pass ? "pass" : "fail"}`)
            .join(", ")}
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            padding: "2px 8px",
            borderRadius: 999,
            background: comfortable
              ? "rgba(74, 222, 128, 0.15)"
              : "rgba(248, 113, 113, 0.15)",
            color: comfortable ? "#4ade80" : "#f87171",
          }}
        >
          Φ_comfort {comfortable ? "pass" : "fail"}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 13, color: swatch.text0 }}>
        Body text rendered in text0 — the tone every S6-checked surface renders
        against this swatch&rsquo;s bg0.
      </p>
      <span style={{ fontSize: 13, color: swatch.link }}>
        A link in this swatch&rsquo;s link color
      </span>
      <code
        style={{
          fontSize: 12,
          color: swatch.codeFg,
          background: swatch.surface,
          padding: "2px 6px",
          borderRadius: 4,
          width: "fit-content",
        }}
      >
        inline code in codeFg
      </code>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
          gap: 10,
        }}
      >
        {chips.map(({ label, key }) => (
          <ColorChip key={key} label={label} value={swatch[key]} />
        ))}
      </div>
    </div>
  )
}

export const AllSwatches: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        gap: 16,
        padding: 24,
        background: "#0d0d0f",
      }}
    >
      {Object.values(SWATCHES).map((swatch) => (
        <SwatchCard key={swatch.id} swatch={swatch} />
      ))}
    </div>
  ),
}

export const Default: Story = {
  render: () => (
    <div style={{ padding: 24, background: "#0d0d0f", maxWidth: 420 }}>
      <SwatchCard swatch={SWATCHES.default} />
    </div>
  ),
}
