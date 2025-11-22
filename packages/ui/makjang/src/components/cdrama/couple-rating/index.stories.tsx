import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CoupleRating } from "."

type Story = StoryObj<typeof CoupleRating>
type Meta = MetaObj<typeof CoupleRating>

export default {
  title: "UI/Makjang/Components/CDrama/CoupleRating",
  component: CoupleRating,
  argTypes: {
    vibe: {
      control: "select",
      options: [
        "soulmates",
        "slowburn",
        "enemies-to-lovers",
        "childhood-sweethearts",
        "forbidden-love",
        "second-chance",
        "fake-dating",
        "unrequited",
      ],
    },
  },
} as Meta

const baseArgs = {
  coupleName: "Min Jae & Hae Won",
  rating: 7.5,
  hypeVsActual: 0.2,
  mlRank: 12,
  flRank: 9,
}

export const Default: Story = {
  args: baseArgs,
}

export const Soulmates: Story = {
  args: {
    ...baseArgs,
    coupleName: "Eun Soo & Hyun Jae",
    vibe: "soulmates",
    rating: 9.4,
    hypeVsActual: 0.35,
    mlRank: 3,
    flRank: 2,
  },
}

export const EnemiesToLovers: Story = {
  args: {
    ...baseArgs,
    coupleName: "Ji Ho & Se Rin",
    vibe: "enemies-to-lovers",
    rating: 8.7,
    hypeVsActual: 0.15,
    mlRank: 8,
    flRank: 6,
  },
}

export const FakeDating: Story = {
  args: {
    ...baseArgs,
    coupleName: "Yoon & Chaeyeon",
    vibe: "fake-dating",
    rating: 8.1,
    hypeVsActual: 0.45,
    mlRank: 7,
    flRank: 11,
  },
}

export const OverHypedDisappointment: Story = {
  args: {
    ...baseArgs,
    coupleName: "Bo Ra & Min Ho",
    vibe: "unrequited",
    rating: 4.9,
    hypeVsActual: 0.65,
    mlRank: 18,
    flRank: 7,
  },
}

export const HiddenGem: Story = {
  args: {
    ...baseArgs,
    coupleName: "Yeon Woo & Soo Jin",
    vibe: "second-chance",
    rating: 8.8,
    hypeVsActual: -0.3,
    mlRank: 5,
    flRank: 14,
  },
}

export const ToxicAndLowRated: Story = {
  args: {
    ...baseArgs,
    coupleName: "Chaebol Heir & His Secretary",
    vibe: "forbidden-love",
    rating: 3.1,
    hypeVsActual: -0.1,
    mlRank: 42,
    flRank: 55,
  },
}

export const PeakMakjang: Story = {
  args: {
    ...baseArgs,
    coupleName: "Amnesiac Chaebol & Secret Twin",
    vibe: "childhood-sweethearts",
    rating: 8.2,
    hypeVsActual: 0.55,
    mlRank: 1,
    flRank: 4,
  },
}

export const SlowBurnMagic: Story = {
  args: {
    ...baseArgs,
    coupleName: "Dae Young & Mi So",
    vibe: "slowburn",
    rating: 9.0,
    hypeVsActual: 0.25,
    mlRank: 2,
    flRank: 5,
  },
}
