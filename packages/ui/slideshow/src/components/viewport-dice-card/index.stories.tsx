import { componentRegistry } from "@some-ui/content"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ViewportConfig } from "some-types-utils"
import { PolyhedronFactory } from "some-types-utils"

import { ViewportDiceCard } from "."

const meta: Meta<typeof ViewportDiceCard> = {
  title: "UI/Slideshow/Components/ViewportDiceCard",
  component: ViewportDiceCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    perspective: {
      control: { type: "range", min: 400, max: 2000, step: 50 },
      description: "CSS perspective value in pixels",
    },
    showBeam: {
      control: "boolean",
      description: "Show border beam animation on active face",
    },
    hideBackface: {
      control: "boolean",
      description: "Hide backfaces of cube faces",
    },
    facesAhead: {
      control: { type: "number", min: 1, max: 5 },
      description: "Number of faces ahead to preload",
    },
  },
}

export default meta
type Story = StoryObj<typeof ViewportDiceCard>

// ============================================================================
// Sample Viewport Configs with registry descriptors
// ============================================================================

const simpleCubeConfig: ViewportConfig = {
  id: "simple-cube",
  items: [
    {
      kind: "neon",
      contentIndex: 0,
      durationMs: 30_000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 1,
      durationMs: 30_000,
      props: {},
    },
    {
      kind: "neon",
      contentIndex: 2,
      durationMs: 30_000,
      props: {},
    },
  ],
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
  cycleName: "cube:y",
}

const multiItemCubeConfig: ViewportConfig = {
  id: "multi-item-cube",
  items: Array.from({ length: 8 }, (_, i) => ({
    kind: "multi-item-card",
    contentIndex: i,
    durationMs: 2000,
    props: { index: i },
  })),
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 2,
  cycleName: "cube:y",
}

const carouselConfig: ViewportConfig = {
  id: "carousel-6",
  items: Array.from({ length: 6 }, (_, i) => ({
    kind: "carousel-item",
    contentIndex: i,
    durationMs: 3000,
    props: { index: i },
  })),
  polyhedron: PolyhedronFactory.carousel(6),
  faceCapacity: 1,
  cycleName: "cube:y",
}

const richContentConfig: ViewportConfig = {
  id: "rich-content",
  items: Array.from({ length: 4 }, (_, i) => ({
    kind: "rich-content-card",
    contentIndex: i,
    durationMs: 4000,
    props: { index: i },
  })),
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
  cycleName: "cube:y",
}

const dashboardConfig: ViewportConfig = {
  id: "dashboard",
  items: Array.from({ length: 4 }, (_, i) => ({
    kind: "dashboard-card",
    contentIndex: i,
    durationMs: 4000,
    props: { index: i },
  })),
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
  cycleName: "cube:y",
}

const galleryConfig: ViewportConfig = {
  id: "gallery",
  items: Array.from({ length: 6 }, (_, i) => ({
    kind: "gallery-image",
    contentIndex: i,
    durationMs: 3500,
    props: { index: i },
  })),
  polyhedron: PolyhedronFactory.carousel(6),
  faceCapacity: 1,
  cycleName: "cube:y",
}

// ============================================================================
// Stories
// ============================================================================

export const SimpleCube: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    registry: componentRegistry,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 1,
  },
}

export const WithoutBeam: Story = {
  args: {
    viewportConfig: {
      ...simpleCubeConfig,
      id: "no-beam",
      items: simpleCubeConfig.items.map((item) => ({
        ...item,
        props: {
          ...item.props,
          bgColors: [
            "bg-gradient-to-br from-violet-500 to-indigo-600",
            "bg-gradient-to-br from-cyan-500 to-blue-600",
            "bg-gradient-to-br from-lime-500 to-green-600",
            "bg-gradient-to-br from-fuchsia-500 to-purple-600",
          ],
        },
      })),
    },
    perspective: 1200,
    showBeam: false,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 1,
  },
}

export const MultiItemPerFace: Story = {
  args: {
    viewportConfig: multiItemCubeConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/20 p-4 flex flex-col gap-4",
    facesAhead: 1,
  },
}

export const CarouselMode: Story = {
  args: {
    viewportConfig: carouselConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 2,
  },
}

export const WithRichContent: Story = {
  args: {
    viewportConfig: richContentConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/30 p-2",
    facesAhead: 1,
  },
}

export const DashboardCards: Story = {
  args: {
    viewportConfig: dashboardConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/30",
    facesAhead: 1,
  },
}

export const ImageGallery: Story = {
  args: {
    viewportConfig: galleryConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-[28rem] h-[28rem]",
    faceClassName: "border-2 border-white/30",
    facesAhead: 2,
  },
}

export const LowPerspective: Story = {
  args: {
    viewportConfig: {
      ...simpleCubeConfig,
      id: "low-perspective",
      items: simpleCubeConfig.items.map((item) => ({
        ...item,
        props: {
          ...item.props,
          bgColors: [
            "bg-gradient-to-br from-red-500 to-rose-600",
            "bg-gradient-to-br from-yellow-500 to-amber-600",
            "bg-gradient-to-br from-green-500 to-lime-600",
            "bg-gradient-to-br from-blue-500 to-sky-600",
          ],
        },
      })),
    },
    perspective: 500,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 1,
  },
}

export const HighPerspective: Story = {
  args: {
    viewportConfig: {
      ...simpleCubeConfig,
      id: "high-perspective",
      items: simpleCubeConfig.items.map((item) => ({
        ...item,
        props: {
          ...item.props,
          bgColors: [
            "bg-gradient-to-br from-indigo-500 to-violet-600",
            "bg-gradient-to-br from-pink-500 to-fuchsia-600",
            "bg-gradient-to-br from-teal-500 to-cyan-600",
            "bg-gradient-to-br from-orange-500 to-red-600",
          ],
        },
      })),
    },
    perspective: 2000,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 1,
  },
}

export const WithBackfaceHidden: Story = {
  args: {
    viewportConfig: {
      ...simpleCubeConfig,
      id: "backface-hidden",
      items: simpleCubeConfig.items.map((item) => ({
        ...item,
        props: {
          ...item.props,
          bgColors: [
            "bg-gradient-to-br from-cyan-500 to-blue-600",
            "bg-gradient-to-br from-violet-500 to-purple-600",
            "bg-gradient-to-br from-rose-500 to-red-600",
            "bg-gradient-to-br from-emerald-500 to-green-600",
          ],
        },
      })),
    },
    perspective: 1200,
    showBeam: true,
    hideBackface: true,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 1,
  },
}

export const AggressivePreloading: Story = {
  args: {
    viewportConfig: carouselConfig,
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
    facesAhead: 3, // Preload 3 faces ahead
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates aggressive preloading with facesAhead=3 for smoother transitions in fast-paced slideshows.",
      },
    },
  },
}
