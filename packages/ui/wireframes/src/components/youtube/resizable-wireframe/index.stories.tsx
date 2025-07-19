import type { Meta, StoryObj } from "@storybook/react-vite"
import { ResizableLayout } from "@wireframes/components/youtube/resizable-wireframe"

const meta: Meta<typeof ResizableLayout.Root> = {
  title: "Wireframes/Youtube/ResizableLayout",
  component: ResizableLayout.Root,
  subcomponents: {
    PanelA: ResizableLayout.PanelA,
    PanelB: ResizableLayout.PanelB,
  },
  args: {
    direction: "vertical",
  },
}

export default meta
type Story = StoryObj<typeof ResizableLayout.Root>

export const Default: Story = {
  render: (args) => (
    <ResizableLayout.Root {...args}>
      <ResizableLayout.PanelA className="bg-red-500">
        <div className="">Panel A Content</div>
      </ResizableLayout.PanelA>
      <ResizableLayout.PanelB className="bg-blue-400">
        <div className="">Panel B Content</div>
      </ResizableLayout.PanelB>
    </ResizableLayout.Root>
  ),
  args: {
    direction: "vertical",
  },
}

export const HorizontalLayout: Story = {
  render: (args) => (
    <ResizableLayout.Root {...args} direction="horizontal">
      <ResizableLayout.PanelA>
        <div style={{ padding: "20px", backgroundColor: "#f0f0f0" }}>
          Panel A Content
        </div>
      </ResizableLayout.PanelA>
      <ResizableLayout.PanelB>
        <div style={{ padding: "20px", backgroundColor: "#e0e0e0" }}>
          Panel B Content
        </div>
      </ResizableLayout.PanelB>
    </ResizableLayout.Root>
  ),
}

export const CustomSizes: Story = {
  render: (args) => (
    <ResizableLayout.Root {...args}>
      <ResizableLayout.PanelA defaultSize={30}>
        <div style={{ padding: "20px", backgroundColor: "#d0d0d0" }}>
          Panel A Content
        </div>
      </ResizableLayout.PanelA>
      <ResizableLayout.PanelB defaultSize={70}>
        <div style={{ padding: "20px", backgroundColor: "#c0c0c0" }}>
          Panel B Content
        </div>
      </ResizableLayout.PanelB>
    </ResizableLayout.Root>
  ),
}
