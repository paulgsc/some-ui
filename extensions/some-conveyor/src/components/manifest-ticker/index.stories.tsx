/**
 * ManifestTicker — scrolling cargo manifest between the rail and the belt.
 *
 * Static, prop-driven segments. Rendered on the steel surface; the stylesheet
 * supplies the masked edges and the seamless scroll.
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { CONVEYOR_TOKENS } from "@conveyor/lib/content/theme-engine"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ManifestTicker, type ManifestTickerProps } from "."

const TickerHost = (props: ManifestTickerProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.innerHTML = ""
    host.appendChild(ManifestTicker(props))
  }, [props])
  return (
    <div
      ref={ref}
      style={{
        width: "760px",
        background: "var(--cv-steel-850)",
        ...CONVEYOR_TOKENS,
      }}
    />
  )
}

const meta: Meta<ManifestTickerProps> = {
  title: "Extensions/Conveyor/ManifestTicker",
  render: (args) => <TickerHost {...args} />,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: { animate: { control: "boolean" } },
}
export default meta
type Story = StoryObj<ManifestTickerProps>

const SEGMENTS: ReadonlyArray<ManifestTickerProps["segments"][number]> = [
  { cube: "01", face: "front", source: "ci/some-ui", window: "6.0s" },
  { cube: "02", face: "right", source: "nvda/journal", window: "9.0s" },
  { cube: "03", face: "top", source: "kor/단어", window: "12.0s" },
  { cube: "04", face: "back", source: "rss/rust-blog", window: "8.0s" },
  { cube: "05", face: "front", source: "metric/mrr", window: "6.0s" },
  { cube: "06", face: "bottom", source: "reminder/review", window: "9.0s" },
]

export const Scrolling: Story = {
  args: { animate: true, segments: SEGMENTS },
}

export const Static: Story = {
  args: { animate: false, segments: SEGMENTS },
}

export const FewSegments: Story = {
  args: { animate: true, segments: SEGMENTS.slice(0, 2) },
}
