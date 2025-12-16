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
  },
}

export default meta
type Story = StoryObj<typeof ViewportDiceCard>

// Helper to create simple content renderer
const createSimpleRenderer =
  (bgColors: Array<string>) => (index: number, isActive: boolean) => (
    <div
      className={`w-full h-full flex items-center justify-center rounded-lg text-white font-bold text-2xl transition-all ${
        bgColors[index % bgColors.length]
      } ${isActive ? "ring-4 ring-yellow-400 scale-105" : ""}`}
    >
      Item {index + 1}
    </div>
  )

// Sample viewport configs
const simpleCubeConfig: ViewportConfig = {
  id: "simple-cube",
  items: [
    { contentIndex: 0, durationMs: 3000 },
    { contentIndex: 1, durationMs: 3000 },
    { contentIndex: 2, durationMs: 3000 },
    { contentIndex: 3, durationMs: 3000 },
  ],
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 1,
}

const multiItemCubeConfig: ViewportConfig = {
  id: "multi-item-cube",
  items: [
    { contentIndex: 0, durationMs: 2000 },
    { contentIndex: 1, durationMs: 2000 },
    { contentIndex: 2, durationMs: 2000 },
    { contentIndex: 3, durationMs: 2000 },
    { contentIndex: 4, durationMs: 2000 },
    { contentIndex: 5, durationMs: 2000 },
    { contentIndex: 6, durationMs: 2000 },
    { contentIndex: 7, durationMs: 2000 },
  ],
  polyhedron: PolyhedronFactory.cube(),
  faceCapacity: 2,
}

const carouselConfig: ViewportConfig = {
  id: "carousel-6",
  items: [
    { contentIndex: 0, durationMs: 3000 },
    { contentIndex: 1, durationMs: 3000 },
    { contentIndex: 2, durationMs: 3000 },
    { contentIndex: 3, durationMs: 3000 },
    { contentIndex: 4, durationMs: 3000 },
    { contentIndex: 5, durationMs: 3000 },
  ],
  polyhedron: PolyhedronFactory.carousel(6),
  faceCapacity: 1,
}

const hexPrismConfig: ViewportConfig = {
  id: "hex-prism",
  items: [
    { contentIndex: 0, durationMs: 2500 },
    { contentIndex: 1, durationMs: 2500 },
    { contentIndex: 2, durationMs: 2500 },
    { contentIndex: 3, durationMs: 2500 },
    { contentIndex: 4, durationMs: 2500 },
    { contentIndex: 5, durationMs: 2500 },
  ],
  polyhedron: PolyhedronFactory.hexPrism(),
  faceCapacity: 1,
}

export const SimpleCube: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: createSimpleRenderer([
      "bg-gradient-to-br from-blue-500 to-purple-600",
      "bg-gradient-to-br from-emerald-500 to-teal-600",
      "bg-gradient-to-br from-rose-500 to-pink-600",
      "bg-gradient-to-br from-amber-500 to-orange-600",
    ]),
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const WithoutBeam: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: createSimpleRenderer([
      "bg-gradient-to-br from-violet-500 to-indigo-600",
      "bg-gradient-to-br from-cyan-500 to-blue-600",
      "bg-gradient-to-br from-lime-500 to-green-600",
      "bg-gradient-to-br from-fuchsia-500 to-purple-600",
    ]),
    perspective: 1200,
    showBeam: false,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const MultiItemPerFace: Story = {
  args: {
    viewportConfig: multiItemCubeConfig,
    renderContent: (index: number, isActive: boolean) => (
      <div
        className={`p-3 rounded-lg transition-all ${
          isActive
            ? "bg-gradient-to-br from-yellow-400 to-orange-500 scale-105"
            : "bg-gradient-to-br from-gray-600 to-gray-800"
        }`}
      >
        <div className="text-white font-semibold text-lg">Item {index + 1}</div>
        <div className="text-white/70 text-sm mt-1">
          {isActive ? "Active" : "Inactive"}
        </div>
      </div>
    ),
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/20 p-4 flex flex-col gap-4",
  },
}

export const CarouselMode: Story = {
  args: {
    viewportConfig: carouselConfig,
    renderContent: (index: number, isActive: boolean) => (
      <div
        className={`w-full h-full flex flex-col items-center justify-center rounded-lg text-white transition-all ${
          [
            "bg-gradient-to-br from-red-500 to-pink-600",
            "bg-gradient-to-br from-orange-500 to-yellow-600",
            "bg-gradient-to-br from-green-500 to-emerald-600",
            "bg-gradient-to-br from-blue-500 to-cyan-600",
            "bg-gradient-to-br from-indigo-500 to-purple-600",
            "bg-gradient-to-br from-purple-500 to-pink-600",
          ][index % 6]
        } ${isActive ? "scale-105" : ""}`}
      >
        <div className="text-6xl mb-4">
          {["🎨", "🎵", "🎮", "📚", "🎬", "⚡"][index % 6]}
        </div>
        <div className="font-bold text-xl">
          {["Art", "Music", "Games", "Books", "Movies", "Energy"][index % 6]}
        </div>
      </div>
    ),
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const HexagonalPrism: Story = {
  args: {
    viewportConfig: hexPrismConfig,
    renderContent: (index: number, isActive: boolean) => (
      <div
        className={`w-full h-full flex items-center justify-center rounded-lg transition-all ${
          [
            "bg-gradient-to-br from-slate-700 to-slate-900",
            "bg-gradient-to-br from-zinc-700 to-zinc-900",
            "bg-gradient-to-br from-neutral-700 to-neutral-900",
            "bg-gradient-to-br from-stone-700 to-stone-900",
            "bg-gradient-to-br from-gray-700 to-gray-900",
            "bg-gradient-to-br from-slate-600 to-slate-800",
          ][index % 6]
        } ${isActive ? "ring-4 ring-blue-400" : ""}`}
      >
        <div className="text-center">
          <div className="text-white text-4xl font-bold mb-2">{index + 1}</div>
          <div className="text-white/60 text-sm">Face {index + 1}</div>
        </div>
      </div>
    ),
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/30",
  },
}

export const WithRichContent: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: (index: number, isActive: boolean) => {
      const content = [
        {
          icon: "📊",
          title: "Analytics",
          desc: "View your metrics",
          color: "from-blue-600 to-cyan-600",
        },
        {
          icon: "⚙️",
          title: "Settings",
          desc: "Configure options",
          color: "from-purple-600 to-pink-600",
        },
        {
          icon: "👥",
          title: "Team",
          desc: "Manage members",
          color: "from-green-600 to-emerald-600",
        },
        {
          icon: "📧",
          title: "Messages",
          desc: "Check inbox",
          color: "from-orange-600 to-red-600",
        },
      ][index % 4]

      return (
        <div
          className={`w-full h-full p-6 rounded-lg bg-gradient-to-br ${content.color} transition-all ${
            isActive ? "scale-105 shadow-2xl" : ""
          }`}
        >
          <div className="text-6xl mb-4">{content.icon}</div>
          <h3 className="text-white font-bold text-2xl mb-2">
            {content.title}
          </h3>
          <p className="text-white/80 text-sm">{content.desc}</p>
          {isActive && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <div className="text-white/60 text-xs">Currently Active</div>
            </div>
          )}
        </div>
      )
    },
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/30 p-2",
  },
}

export const LowPerspective: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: createSimpleRenderer([
      "bg-gradient-to-br from-red-500 to-rose-600",
      "bg-gradient-to-br from-yellow-500 to-amber-600",
      "bg-gradient-to-br from-green-500 to-lime-600",
      "bg-gradient-to-br from-blue-500 to-sky-600",
    ]),
    perspective: 500,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const HighPerspective: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: createSimpleRenderer([
      "bg-gradient-to-br from-indigo-500 to-violet-600",
      "bg-gradient-to-br from-pink-500 to-fuchsia-600",
      "bg-gradient-to-br from-teal-500 to-cyan-600",
      "bg-gradient-to-br from-orange-500 to-red-600",
    ]),
    perspective: 2000,
    showBeam: true,
    hideBackface: false,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const SmallSize: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: (index: number, isActive: boolean) => (
      <div
        className={`w-full h-full flex items-center justify-center rounded-lg text-white font-bold text-sm transition-all ${
          ["bg-blue-500", "bg-green-500", "bg-red-500", "bg-purple-500"][
            index % 4
          ]
        } ${isActive ? "ring-2 ring-yellow-400" : ""}`}
      >
        {index + 1}
      </div>
    ),
    perspective: 800,
    showBeam: true,
    hideBackface: false,
    className: "w-32 h-32",
    faceClassName: "border border-white/20",
  },
}

export const LargeSize: Story = {
  args: {
    viewportConfig: multiItemCubeConfig,
    renderContent: (index: number, isActive: boolean) => (
      <div
        className={`p-6 rounded-xl transition-all ${
          isActive
            ? "bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg"
            : "bg-gradient-to-br from-gray-700 to-gray-900"
        }`}
      >
        <div className="text-white">
          <div className="font-bold text-2xl mb-2">Content {index + 1}</div>
          <div className="text-white/70 text-base">
            {isActive ? "🔴 Live" : "Waiting..."}
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 bg-white/20 rounded-full w-full" />
            <div className="h-3 bg-white/20 rounded-full w-3/4" />
            <div className="h-3 bg-white/20 rounded-full w-1/2" />
          </div>
        </div>
      </div>
    ),
    perspective: 1500,
    showBeam: true,
    hideBackface: false,
    className: "w-[32rem] h-[32rem]",
    faceClassName: "border-2 border-white/20 p-6 flex flex-col gap-4",
  },
}

export const WithBackfaceHidden: Story = {
  args: {
    viewportConfig: simpleCubeConfig,
    renderContent: createSimpleRenderer([
      "bg-gradient-to-br from-cyan-500 to-blue-600",
      "bg-gradient-to-br from-violet-500 to-purple-600",
      "bg-gradient-to-br from-rose-500 to-red-600",
      "bg-gradient-to-br from-emerald-500 to-green-600",
    ]),
    perspective: 1200,
    showBeam: true,
    hideBackface: true,
    className: "w-80 h-80",
    faceClassName: "border-2 border-white/20",
  },
}

export const DashboardCards: Story = {
  args: {
    viewportConfig: {
      id: "dashboard",
      items: [
        { contentIndex: 0, durationMs: 4000 },
        { contentIndex: 1, durationMs: 4000 },
        { contentIndex: 2, durationMs: 4000 },
        { contentIndex: 3, durationMs: 4000 },
      ],
      polyhedron: PolyhedronFactory.cube(),
      faceCapacity: 1,
    },
    renderContent: (index: number, isActive: boolean) => {
      const dashboards = [
        {
          title: "Revenue",
          value: "$125.4K",
          change: "+12.5%",
          icon: "💰",
          color: "from-emerald-600 to-green-700",
        },
        {
          title: "Users",
          value: "8,432",
          change: "+23.1%",
          icon: "👥",
          color: "from-blue-600 to-cyan-700",
        },
        {
          title: "Orders",
          value: "2,341",
          change: "+8.3%",
          icon: "📦",
          color: "from-purple-600 to-violet-700",
        },
        {
          title: "Conversion",
          value: "3.24%",
          change: "+0.4%",
          icon: "📈",
          color: "from-orange-600 to-red-700",
        },
      ][index % 4]

      return (
        <div
          className={`w-full h-full p-8 rounded-2xl bg-gradient-to-br ${dashboards.color} transition-all ${
            isActive ? "scale-105 shadow-2xl" : ""
          }`}
        >
          <div className="flex items-start justify-between mb-6">
            <div className="text-5xl">{dashboards.icon}</div>
            {isActive && (
              <div className="px-3 py-1 bg-white/20 rounded-full text-white text-xs font-semibold">
                LIVE
              </div>
            )}
          </div>
          <div className="text-white/80 text-sm font-medium mb-2">
            {dashboards.title}
          </div>
          <div className="text-white text-4xl font-bold mb-3">
            {dashboards.value}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-white text-sm font-semibold bg-white/20 px-2 py-1 rounded">
              {dashboards.change}
            </div>
            <div className="text-white/60 text-xs">vs last month</div>
          </div>
        </div>
      )
    },
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-96 h-96",
    faceClassName: "border-2 border-white/30",
  },
}

export const ImageGallery: Story = {
  args: {
    viewportConfig: carouselConfig,
    renderContent: (index: number, isActive: boolean) => {
      const colors = [
        "from-rose-400 via-pink-500 to-purple-500",
        "from-blue-400 via-cyan-500 to-teal-500",
        "from-yellow-400 via-orange-500 to-red-500",
        "from-green-400 via-emerald-500 to-teal-500",
        "from-purple-400 via-violet-500 to-indigo-500",
        "from-pink-400 via-rose-500 to-red-500",
      ]

      return (
        <div className="w-full h-full relative overflow-hidden rounded-xl">
          <div
            className={`absolute inset-0 bg-gradient-to-br ${
              colors[index % 6]
            } transition-all`}
          />
          <div className="relative z-10 h-full flex flex-col items-center justify-center p-6 text-white">
            <div className="text-7xl mb-4">
              {["🌅", "🌄", "🌠", "🌊", "🏔️", "🌺"][index % 6]}
            </div>
            <div className="text-2xl font-bold mb-2">
              {
                [
                  "Sunrise",
                  "Mountains",
                  "Starry Night",
                  "Ocean",
                  "Peak",
                  "Flora",
                ][index % 6]
              }
            </div>
            <div className="text-white/80 text-sm">Photo {index + 1} of 6</div>
            {isActive && (
              <div className="mt-6 px-4 py-2 bg-white/20 rounded-full text-sm font-semibold backdrop-blur">
                Now Viewing
              </div>
            )}
          </div>
        </div>
      )
    },
    perspective: 1200,
    showBeam: true,
    hideBackface: false,
    className: "w-[28rem] h-[28rem]",
    faceClassName: "border-2 border-white/30",
  },
}
