import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CoupleRating } from "."

type Story = StoryObj<typeof CoupleRating>
type Meta = MetaObj<typeof CoupleRating>

export default {
  title: "UI/Makjang/CDrama/CoupleRating",
  component: CoupleRating,
  args: {
    coupleName: "ML ❤️ FL",
    rating: 7.5,
    hypeVsActual: 0.2,
    mlRank: 12,
    flRank: 9,
  },
} as Meta

export const Default: Story = {}

export const HighRated: Story = {
  args: {
    coupleName: "Eun Soo & Hyun Jae",
    rating: 9.4,
    hypeVsActual: 0.35, // +35% hype
    mlRank: 3,
    flRank: 2,
  },
}

export const OverHyped: Story = {
  args: {
    coupleName: "Bo Ra & Min Ho",
    rating: 6.2,
    hypeVsActual: 0.65, // WAY too hyped
    mlRank: 18,
    flRank: 7,
  },
}

export const UnderHyped: Story = {
  args: {
    coupleName: "Yeon Woo & Soo Jin",
    rating: 8.8,
    hypeVsActual: -0.3, // -30% under-recognized
    mlRank: 5,
    flRank: 14,
  },
}

export const LowRated: Story = {
  args: {
    coupleName: "Toxic ML & Gaslighted FL",
    rating: 3.1,
    hypeVsActual: -0.1,
    mlRank: 42,
    flRank: 55,
  },
}

export const ExtremeMakjang: Story = {
  args: {
    coupleName: "Amnesiac Chaebol & Secret Twin",
    rating: 8.2,
    hypeVsActual: 0.55,
    mlRank: 1,
    flRank: 4,
  },
}
