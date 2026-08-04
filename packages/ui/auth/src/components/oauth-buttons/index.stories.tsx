import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { KeyRound } from "lucide-react"

import { OAuthButtons } from "."

type Story = StoryObj<typeof OAuthButtons>
type Meta = MetaObj<typeof OAuthButtons>

export const Default: Story = {
  args: {
    providers: [
      { id: "github", label: "GitHub" },
      { id: "google", label: "Google" },
    ],
  },
}

/**
 * Marks arrive as `provider.icon`, so no brand SVGs are compiled into this
 * package's bundle. Lucide's own brand icons are deprecated and due for
 * removal in v1, so a real deployment supplies its marks from elsewhere —
 * the generic icon here only stands in to show the slot.
 */
export const WithIcons: Story = {
  args: {
    providers: [
      {
        id: "github",
        label: "GitHub",
        icon: <KeyRound className="size-4" aria-hidden="true" />,
      },
      { id: "google", label: "Google" },
    ],
  },
}

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
}

/** No configured providers means no buttons and no stray divider. */
export const NoProviders: Story = {
  args: {
    providers: [],
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/OAuthButtons",
  component: OAuthButtons,
  tags: ["autodocs"],
  argTypes: {
    onSelect: { action: "provider selected" },
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
}

export default meta
