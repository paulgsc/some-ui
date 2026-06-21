/**
 * ProjectionCell — the canonical face primitive.
 *
 * Stories cover the vocabulary the intent prints on every face: a tag + status
 * dot, a body (plain / emphasised / node), a toned meta line, and the queued
 * staged variant. Rendered on the steel surface by the VanillaBridge frame.
 */

import { VanillaBridge } from "@conveyor/components/story-bridge"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { ProjectionCell, type ProjectionCellProps } from "."

const meta: Meta<ProjectionCellProps> = {
  title: "Extensions/Conveyor/ProjectionCell",
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  render: (args) => <VanillaBridge factory={ProjectionCell} props={args} />,
  argTypes: {
    status: {
      control: "inline-radio",
      options: ["live", "warn", "down", "idle"],
    },
  },
}
export default meta
type Story = StoryObj<ProjectionCellProps>

export const Live: Story = {
  args: {
    tag: "CI",
    status: "live",
    body: "some-ui · build passing",
    meta: [{ text: "12 pkgs", tone: "pos" }, { text: "1m 48s" }],
  },
}

export const EmphasizedValue: Story = {
  args: {
    tag: "STREAK",
    status: "live",
    body: "5",
    emphasizeBody: true,
    meta: "/ 8 categories",
  },
}

export const Warn: Story = {
  args: {
    tag: "METRIC",
    status: "warn",
    body: "MRR · $0",
    meta: "preview · pre-launch",
  },
}

export const Down: Story = {
  args: {
    tag: "ALERT",
    status: "down",
    body: "IV crush · earnings",
    meta: [{ text: "watch close", tone: "neg" }],
  },
}

export const TonedMeta: Story = {
  args: {
    tag: "NVDA",
    status: "live",
    body: "long call · 6/20 140c",
    meta: [
      { text: "Δ +0.62", tone: "num" },
      { text: "θ −1.1", tone: "neg" },
    ],
  },
}

export const NoMeta: Story = {
  args: { tag: "PUSH", status: "live", body: "claude-code → main" },
}

export const LongBody: Story = {
  args: {
    tag: "BOOKMARK",
    status: "idle",
    body: "MV3 cssom quirks — classify survives refresh on hard reload",
    meta: "saved · read later",
  },
}

export const Queued: Story = {
  args: { tag: "QUEUED", body: "nix flake · check", queued: true },
}
