import type { JSX } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "@storybook/test"

import { LibraryTemplatePicker } from "."

const meta: Meta<typeof LibraryTemplatePicker> = {
  title: "UI/Slideshow/Orchestrator/LibraryTemplatePicker",
  component: LibraryTemplatePicker,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[600px] h-[400px] border p-6 bg-background rounded-lg">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof LibraryPickerWrapper>

type LibraryPickerWrapperProps = {
  _items: Array<unknown>
  _loading: boolean
  onSelectTemplate: (ui: Array<unknown>, templateName: string) => void
}

// Wrapper that controls state
const LibraryPickerWrapper = ({
  onSelectTemplate,
}: LibraryPickerWrapperProps): JSX.Element => {
  // Override the hook's context/provider if needed, or
  // use a mock provider in preview.ts
  return <LibraryTemplatePicker onSelectTemplate={onSelectTemplate} />
}

export const Default: Story = {
  render: (args) => <LibraryPickerWrapper {...args} />,
  args: {
    _items: [
      {
        fileName: "marketing-hero",
        displayName: "Marketing Hero",
        config: { ui: [{}, {}, {}] },
      },
    ],
    _loading: false,
    onSelectTemplate: fn(),
  },
}
