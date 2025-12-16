import type { Meta, StoryObj } from "@storybook/react-vite"

import { CubeGeometry } from "."

const meta: Meta<typeof CubeGeometry> = {
  title: "UI/Slideshow/Components/CubeGeometry",
  component: CubeGeometry,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    perspective: {
      control: { type: "range", min: 400, max: 2000, step: 50 },
      description: "CSS perspective value in pixels",
    },
    xRotation: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Rotation around X axis in degrees",
    },
    yRotation: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Rotation around Y axis in degrees",
    },
    hideBackface: {
      control: "boolean",
      description: "Hide backfaces of cube faces",
    },
  },
}

export default meta
type Story = StoryObj<typeof CubeGeometry>

const defaultFaces = [
  {
    key: "front",
    content: <div className="text-2xl font-bold text-white">Front</div>,
  },
  {
    key: "right",
    content: <div className="text-2xl font-bold text-white">Right</div>,
  },
  {
    key: "back",
    content: <div className="text-2xl font-bold text-white">Back</div>,
  },
  {
    key: "left",
    content: <div className="text-2xl font-bold text-white">Left</div>,
  },
  {
    key: "top",
    content: <div className="text-2xl font-bold text-white">Top</div>,
  },
  {
    key: "bottom",
    content: <div className="text-2xl font-bold text-white">Bottom</div>,
  },
]

export const Default: Story = {
  args: {
    xRotation: -20,
    yRotation: 30,
    perspective: 1200,
    hideBackface: false,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const FrontView: Story = {
  args: {
    xRotation: 0,
    yRotation: 0,
    perspective: 1200,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-emerald-500 to-teal-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const TopView: Story = {
  args: {
    xRotation: -90,
    yRotation: 0,
    perspective: 1200,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-rose-500 to-pink-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const RightView: Story = {
  args: {
    xRotation: 0,
    yRotation: 90,
    perspective: 1200,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-amber-500 to-orange-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const IsometricView: Story = {
  args: {
    xRotation: -35,
    yRotation: 45,
    perspective: 1200,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-violet-500 to-indigo-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const WithBackfaceHidden: Story = {
  args: {
    xRotation: -20,
    yRotation: 160,
    perspective: 1200,
    hideBackface: true,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const LowPerspective: Story = {
  args: {
    xRotation: -20,
    yRotation: 30,
    perspective: 500,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-lime-500 to-green-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const HighPerspective: Story = {
  args: {
    xRotation: -20,
    yRotation: 30,
    perspective: 2000,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-fuchsia-500 to-purple-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}

export const WithImages: Story = {
  args: {
    xRotation: -25,
    yRotation: 35,
    perspective: 1200,
    faces: [
      {
        key: "front",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              🎨
            </div>
            <p className="text-white font-semibold">Art</p>
          </div>
        ),
      },
      {
        key: "right",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              🎵
            </div>
            <p className="text-white font-semibold">Music</p>
          </div>
        ),
      },
      {
        key: "back",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              📚
            </div>
            <p className="text-white font-semibold">Books</p>
          </div>
        ),
      },
      {
        key: "left",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              🎮
            </div>
            <p className="text-white font-semibold">Games</p>
          </div>
        ),
      },
      {
        key: "top",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              ⭐
            </div>
            <p className="text-white font-semibold">Featured</p>
          </div>
        ),
      },
      {
        key: "bottom",
        content: (
          <div className="flex flex-col items-center justify-center gap-2 p-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
              🔧
            </div>
            <p className="text-white font-semibold">Tools</p>
          </div>
        ),
      },
    ],
    faceClassName:
      "bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 border-2 border-white/30",
    className: "w-80 h-80",
  },
}

export const LargeSize: Story = {
  args: {
    xRotation: -20,
    yRotation: 30,
    perspective: 1500,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-red-500 to-orange-600 border-2 border-white/30",
    className: "w-96 h-96",
  },
}

export const SmallSize: Story = {
  args: {
    xRotation: -20,
    yRotation: 30,
    perspective: 800,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-sky-500 to-blue-600 border-2 border-white/30",
    className: "w-32 h-32",
  },
}

export const WithComplexContent: Story = {
  args: {
    xRotation: -30,
    yRotation: 40,
    perspective: 1200,
    faces: [
      {
        key: "front",
        content: (
          <div className="w-full h-full p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-white font-bold text-xl mb-2">Dashboard</h3>
              <p className="text-white/80 text-sm">View your stats</p>
            </div>
            <div className="space-y-1">
              <div className="h-2 bg-white/30 rounded-full w-full" />
              <div className="h-2 bg-white/30 rounded-full w-3/4" />
              <div className="h-2 bg-white/30 rounded-full w-1/2" />
            </div>
          </div>
        ),
      },
      {
        key: "right",
        content: (
          <div className="w-full h-full p-6 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">42</div>
              <p className="text-white/80 text-sm">Active Users</p>
            </div>
          </div>
        ),
      },
      {
        key: "back",
        content: (
          <div className="w-full h-full p-6 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-4">
              <div className="w-16 h-16 rounded-lg bg-white/20" />
              <div className="w-16 h-16 rounded-lg bg-white/20" />
              <div className="w-16 h-16 rounded-lg bg-white/20" />
              <div className="w-16 h-16 rounded-lg bg-white/20" />
            </div>
          </div>
        ),
      },
      {
        key: "left",
        content: (
          <div className="w-full h-full p-6 flex flex-col justify-center gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/30" />
                <div className="h-4 bg-white/30 rounded flex-1" />
              </div>
            ))}
          </div>
        ),
      },
      {
        key: "top",
        content: (
          <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
            <div className="text-white text-2xl font-bold">Premium</div>
          </div>
        ),
      },
      {
        key: "bottom",
        content: (
          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
            <div className="text-white/60 text-sm">© 2024</div>
          </div>
        ),
      },
    ],
    faceClassName:
      "bg-gradient-to-br from-slate-700 to-slate-900 border border-white/20 shadow-xl",
    className: "w-80 h-80",
  },
}

export const Interactive: Story = {
  render: (args) => {
    const [xRot, setXRot] = useState(-20)
    const [yRot, setYRot] = useState(30)

    return (
      <div className="flex flex-col gap-6">
        <CubeGeometry {...args} xRotation={xRot} yRotation={yRot} />
        <div className="space-y-4 w-80">
          <div>
            <label className="block text-sm font-medium mb-2">
              X Rotation: {xRot}°
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              value={xRot}
              onChange={(e) => setXRot(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Y Rotation: {yRot}°
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              value={yRot}
              onChange={(e) => setYRot(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </div>
    )
  },
  args: {
    perspective: 1200,
    faces: defaultFaces,
    faceClassName:
      "bg-gradient-to-br from-purple-500 to-pink-600 border-2 border-white/30",
    className: "w-64 h-64",
  },
}
