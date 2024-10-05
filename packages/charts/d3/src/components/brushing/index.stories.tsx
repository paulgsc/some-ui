import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import HighlightedBarChart from "."

type Meta = MetaObj<typeof HighlightedBarChart>
type Story = StoryObj<typeof HighlightedBarChart>

const data = [
  {
    species: "Adelie",
    culmen_length_mm: 39.1,
    culmen_depth_mm: 18.7,
    flipper_length_mm: 181,
    body_mass_g: 3750,
  },
  {
    species: "Chinstrap",
    culmen_length_mm: 46.5,
    culmen_depth_mm: 17.9,
    flipper_length_mm: 195,
    body_mass_g: 3650,
  },
  {
    species: "Gentoo",
    culmen_length_mm: 50,
    culmen_depth_mm: 15.2,
    flipper_length_mm: 217,
    body_mass_g: 5000,
  },
  // Add more data points...
]

const dimensions = [
  "culmen_length_mm",
  "culmen_depth_mm",
  "flipper_length_mm",
  "body_mass_g",
]
const size = 150

export const Default: Story = {
  args: {
    data: data,
    dimensions: dimensions,
    size: size,
  },
}

export default { component: HighlightedBarChart } as Meta
