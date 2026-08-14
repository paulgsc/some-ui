import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AuthCard } from "."

type Story = StoryObj<typeof AuthCard>
type Meta = MetaObj<typeof AuthCard>

export const Default: Story = {
  args: {
    title: "Sign in",
    description: "Welcome back.",
    children: (
      <p className="text-muted-foreground text-sm">
        Form fields go here. The card is a shell — it holds the title, the
        description, and a footer for cross-links out of the step.
      </p>
    ),
  },
}

export const WithFooter: Story = {
  args: {
    ...Default.args,
    footer: <span>No account yet? Create one</span>,
  },
}

export const TitleOnly: Story = {
  args: {
    title: "Check your email",
    children: (
      <p className="text-muted-foreground text-sm">
        A reset link is on its way.
      </p>
    ),
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthCard",
  component: AuthCard,
  tags: ["autodocs"],
}

export default meta
