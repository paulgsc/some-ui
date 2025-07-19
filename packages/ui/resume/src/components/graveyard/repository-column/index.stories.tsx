import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { RepositoryColumn } from "."

type Story = StoryObj<typeof RepositoryColumn>
type Meta = MetaObj<typeof RepositoryColumn>

export const Default: Story = {}

export default {
  title: "UI/Resume/Components/Graveyard/RepositoryColumn",
  component: RepositoryColumn,
} as Meta
