/**
 * ControlRail — instrumentation HUD docked above the belt.
 *
 * Static, prop-driven chips (no scheduler wiring). Rendered on the steel
 * surface; the stylesheet supplies the live pulse animation.
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { CONVEYOR_TOKENS } from "@conveyor/lib/content/theme-engine"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ControlRail, type ControlRailProps } from "."

const RailHost = (props: ControlRailProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.innerHTML = ""
    host.appendChild(ControlRail(props))
  }, [props])
  return (
    <div
      ref={ref}
      style={{ width: "760px", padding: "24px", ...CONVEYOR_TOKENS }}
    />
  )
}

const meta: Meta<ControlRailProps> = {
  title: "Extensions/Conveyor/ControlRail",
  render: (args) => <RailHost {...args} />,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: { pulse: { control: "boolean" } },
}
export default meta
type Story = StoryObj<ControlRailProps>

export const Running: Story = {
  args: {
    id: "some-conveyor",
    pulse: true,
    chips: [
      { label: "scheduler", value: "running", tone: "live", dot: true },
      { label: "wasm", value: "✓ loaded", tone: "live" },
      { label: "tick", value: "0x3F", tone: "signal" },
      { label: "window", value: "9.0s" },
      { label: "cells", value: "12" },
    ],
  },
}

export const Degraded: Story = {
  args: {
    id: "some-conveyor",
    pulse: false,
    chips: [
      { label: "scheduler", value: "stalled", tone: "alert", dot: true },
      { label: "wasm", value: "✓ loaded", tone: "live" },
      { label: "tick", value: "0x00", tone: "signal" },
      { label: "cells", value: "0" },
    ],
  },
}

export const Minimal: Story = {
  args: {
    chips: [{ label: "scheduler", value: "running", tone: "live", dot: true }],
  },
}
