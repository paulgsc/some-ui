import type { Meta, StoryObj } from "@storybook/react-vite"
import { LoadingCodeState } from "."

const meta: Meta<typeof LoadingCodeState> = {
  title: "UI/Input/Components/Typing/LoadingCodeState",
  component: LoadingCodeState,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    attempt: {
      control: { type: "number", min: 0, max: 10 },
      description: "Current retry attempt number",
    },
  },
}

export default meta
type Story = StoryObj<typeof LoadingCodeState>

/* ---------- Basic Stories ---------- */

export const InitialLoad: Story = {
  args: {
    attempt: 0,
  },
  parameters: {
    docs: {
      description: {
        story: "Initial loading state before any attempts",
      },
    },
  },
}

export const FirstAttempt: Story = {
  args: {
    attempt: 1,
  },
  parameters: {
    docs: {
      description: {
        story: "First loading attempt",
      },
    },
  },
}

export const SecondAttempt: Story = {
  args: {
    attempt: 2,
  },
  parameters: {
    docs: {
      description: {
        story: "Second attempt with retry message",
      },
    },
  },
}

export const ThirdAttempt: Story = {
  args: {
    attempt: 3,
  },
  parameters: {
    docs: {
      description: {
        story: "Third retry attempt",
      },
    },
  },
}

export const MultipleRetries: Story = {
  args: {
    attempt: 5,
  },
  parameters: {
    docs: {
      description: {
        story: "Multiple retry attempts shown",
      },
    },
  },
}

export const MaxRetries: Story = {
  args: {
    attempt: 10,
  },
  parameters: {
    docs: {
      description: {
        story: "Maximum retry attempts reached",
      },
    },
  },
}

/* ---------- Different Container Sizes ---------- */

export const InCard: Story = {
  args: {
    attempt: 1,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto">
        <div className="p-6 bg-card border-border rounded-lg">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Loading state inside a card container",
      },
    },
  },
}

export const FullWidth: Story = {
  args: {
    attempt: 1,
  },
  decorators: [
    (Story) => (
      <div className="w-full h-96">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Loading state in full-width container",
      },
    },
  },
}

export const Compact: Story = {
  args: {
    attempt: 1,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md mx-auto">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Loading state in compact container",
      },
    },
  },
}

/* ---------- Responsive Views ---------- */

export const MobileView: Story = {
  args: {
    attempt: 1,
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story: "Loading state on mobile devices",
      },
    },
  },
}

export const TabletView: Story = {
  args: {
    attempt: 2,
  },
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "Loading state on tablet devices",
      },
    },
  },
}

/* ---------- Animation Testing ---------- */

export const AnimationShowcase: Story = {
  args: {
    attempt: 1,
  },
  decorators: [
    (Story) => (
      <div className="space-y-8">
        <div className="text-center text-sm text-muted-foreground">
          Watch the spinning loader, pulsing background, and bouncing dots
        </div>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: "Showcases all loading animations together",
      },
    },
  },
}
