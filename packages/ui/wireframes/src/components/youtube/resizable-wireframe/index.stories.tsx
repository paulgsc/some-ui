import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { YouTubeWireframe } from "."
import type { YouTubeRegion } from "."

const meta: Meta<typeof YouTubeWireframe> = {
  title: "UI/Wireframes/YouTubeWireframe",
  component: YouTubeWireframe,
  parameters: {
    layout: "fullscreen",
    controls: {
      exclude: ["content", "youtubeTree", "layout", "constraints"],
    },
  },
  argTypes: {
    // Completely disable content from args table
    content: { table: { disable: true } },
    youtubeTree: { table: { disable: true } },
    layout: { table: { disable: true } },
    constraints: { table: { disable: true } },

    focusRegion: {
      control: "select",
      options: [
        null,
        "video",
        "title",
        "mainContent",
        "footerLeft",
        "footerRight",
        "sidebarTop",
        "sidebarBottom",
      ],
      description: "Which region to focus (null = no focus)",
    },
    focusIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Focus intensity (0 = normal layout, 1 = fully focused)",
    },
    transitionMs: {
      control: { type: "number", min: 0, step: 50 },
      description: "Transition duration in milliseconds",
    },
  },
}

export default meta
type Story = StoryObj<typeof YouTubeWireframe>

/* -----------------------------------------------------
 * Helper: Default content for stories
 * Hoisted to module level for stability
 * --------------------------------------------------- */
const createDefaultContent = (showLabels = true) => ({
  video: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-purple-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">VIDEO</div>
          <div className="text-xs text-gray-500">🎬 Video Player</div>
        </div>
      )}
    </div>
  ),
  title: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-yellow-100 to-amber-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">TITLE</div>
          <div className="text-xs text-gray-500">🔥 Breaking News</div>
        </div>
      )}
    </div>
  ),
  mainContent: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-cyan-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-2">MAIN CONTENT</div>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• Recommended video</li>
            <li>• Recommended video</li>
            <li>• Recommended video</li>
          </ul>
        </div>
      )}
    </div>
  ),
  footerLeft: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-slate-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">FOOTER LEFT</div>
          <div className="text-xs text-gray-500">© 2025</div>
        </div>
      )}
    </div>
  ),
  footerRight: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-slate-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">FOOTER RIGHT</div>
          <div className="text-xs text-gray-500">⚙️ Settings</div>
        </div>
      )}
    </div>
  ),
  sidebarTop: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-100 to-emerald-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">SIDEBAR TOP</div>
          <div className="text-xs text-gray-500">⬆️ Suggested</div>
        </div>
      )}
    </div>
  ),
  sidebarBottom: (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100">
      {showLabels && (
        <div className="text-center">
          <div className="font-semibold text-gray-700 mb-1">SIDEBAR BOTTOM</div>
          <div className="text-xs text-gray-500">⬇️ Shorts</div>
        </div>
      )}
    </div>
  ),
})

// Hoist content objects at module level for stability
const defaultContent = createDefaultContent()

const minimalContent = {
  video: (
    <div className="w-full h-full bg-black flex items-center justify-center">
      <div className="text-white text-sm">▶ Video</div>
    </div>
  ),
  title: (
    <div className="w-full h-full bg-gray-900 text-white px-4 py-2 text-sm font-medium">
      Video Title Goes Here
    </div>
  ),
  mainContent: (
    <div className="w-full h-full bg-white p-4 overflow-auto">
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded">
            <div className="w-32 h-20 bg-gray-300 rounded flex-shrink-0" />
            <div>
              <div className="font-medium text-sm">Recommended Video {i}</div>
              <div className="text-xs text-gray-500">Channel • 1M views</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  sidebarTop: (
    <div className="w-full h-full bg-gray-50 p-3 overflow-auto">
      <div className="text-xs font-semibold text-gray-700 mb-2">Comments</div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-xs text-gray-600">
            User {i}: Great video!
          </div>
        ))}
      </div>
    </div>
  ),
  sidebarBottom: (
    <div className="w-full h-full bg-gray-100 p-3">
      <div className="text-xs font-semibold text-gray-700">Live Chat</div>
    </div>
  ),
  footerLeft: (
    <div className="w-full h-full bg-white border-t border-gray-200 px-4 py-2 flex items-center text-xs text-gray-500">
      © 2025 VideoApp
    </div>
  ),
  footerRight: (
    <div className="w-full h-full bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-end gap-2 text-xs">
      <button className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">
        Settings
      </button>
    </div>
  ),
}

const richContent = {
  video: (
    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-6xl mb-4">▶</div>
        <div className="text-sm opacity-80">4K Video Player</div>
      </div>
    </div>
  ),
  title: (
    <div className="w-full h-full bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-3 flex items-center justify-between">
      <div className="font-bold">🔥 TRENDING: Amazing Content Here</div>
      <div className="text-sm opacity-90">• LIVE</div>
    </div>
  ),
  mainContent: (
    <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 p-6 overflow-auto">
      <h3 className="font-bold text-lg mb-4">Recommended for You</h3>
      <div className="grid grid-cols-1 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex gap-4">
              <div className="w-40 h-24 bg-gradient-to-br from-purple-200 to-pink-200 rounded flex-shrink-0" />
              <div>
                <div className="font-semibold">Video Title {i}</div>
                <div className="text-sm text-gray-500">Channel Name</div>
                <div className="text-xs text-gray-400 mt-1">
                  1.2M views • 2 days ago
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  sidebarTop: (
    <div className="w-full h-full bg-gradient-to-br from-green-50 to-emerald-50 p-4 overflow-auto">
      <h4 className="font-bold text-sm mb-3">💬 Live Comments</h4>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded p-2 text-xs">
            <div className="font-semibold text-emerald-600">@user{i}</div>
            <div className="text-gray-600">This is amazing! 🔥</div>
          </div>
        ))}
      </div>
    </div>
  ),
  sidebarBottom: (
    <div className="w-full h-full bg-gradient-to-br from-orange-50 to-amber-50 p-4">
      <h4 className="font-bold text-sm mb-3">⚡ Shorts</h4>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="aspect-[9/16] bg-gradient-to-br from-orange-200 to-red-200 rounded"
          />
        ))}
      </div>
    </div>
  ),
  footerLeft: (
    <div className="w-full h-full bg-gray-900 text-white px-6 py-3 flex items-center text-xs">
      © 2025 VideoApp • Terms • Privacy
    </div>
  ),
  footerRight: (
    <div className="w-full h-full bg-gray-900 text-white px-6 py-3 flex items-center justify-end gap-3">
      <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">
        Settings
      </button>
      <button className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">
        Help
      </button>
    </div>
  ),
}

/* -----------------------------------------------------
 * Base / Default
 * --------------------------------------------------- */
export const Default: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: null,
    focusIntensity: 0,
    transitionMs: 300,
  },
}

/* -----------------------------------------------------
 * Focused modes
 * --------------------------------------------------- */
export const VideoFocused: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "video",
    focusIntensity: 1,
    transitionMs: 300,
  },
}

export const MainContentFocused: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "mainContent",
    focusIntensity: 1,
    transitionMs: 300,
  },
}

export const SidebarFocused: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "sidebarTop",
    focusIntensity: 1,
    transitionMs: 300,
  },
}

export const TitleFocused: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "title",
    focusIntensity: 1,
    transitionMs: 300,
  },
}

/* -----------------------------------------------------
 * Partial focus (0 < intensity < 1)
 * --------------------------------------------------- */
export const VideoPartialFocus: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "video",
    focusIntensity: 0.5,
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "50% focus - video grows but doesn't dominate",
      },
    },
  },
}

export const VideoSubtleFocus: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "video",
    focusIntensity: 0.25,
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "25% focus - gentle emphasis on video",
      },
    },
  },
}

export const MainContentStrongFocus: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "mainContent",
    focusIntensity: 0.85,
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story: "85% focus - strong emphasis while keeping sidebars visible",
      },
    },
  },
}

/* -----------------------------------------------------
 * Custom content examples
 * --------------------------------------------------- */
export const MinimalContent: Story = {
  render: (args) => <YouTubeWireframe {...args} content={minimalContent} />,
  args: {
    focusRegion: null,
    focusIntensity: 0,
  },
  parameters: {
    docs: {
      description: {
        story: "Example with more realistic content styling",
      },
    },
  },
}

export const RichContent: Story = {
  render: (args) => <YouTubeWireframe {...args} content={richContent} />,
  args: {
    focusRegion: null,
    focusIntensity: 0,
  },
  parameters: {
    docs: {
      description: {
        story: "Rich, colorful content with gradients and interactive elements",
      },
    },
  },
}

/* -----------------------------------------------------
 * Interactive (click to focus)
 * --------------------------------------------------- */
export const ClickToFocus: Story = {
  render: (args) => {
    const [focusRegion, setFocusRegion] = useState<YouTubeRegion | null>(null)

    return (
      <YouTubeWireframe
        {...args}
        content={defaultContent}
        focusRegion={focusRegion}
        focusIntensity={1}
        transitionMs={250}
        onRegionClick={(region) => {
          // Toggle: click same region to unfocus
          setFocusRegion(focusRegion === region ? null : region)
        }}
      />
    )
  },
  parameters: {
    docs: {
      description: {
        story: "Click any region to fully focus it. Click again to unfocus.",
      },
    },
  },
}

export const ClickToFocusWithControls: Story = {
  render: (args) => {
    const [focusRegion, setFocusRegion] = useState<YouTubeRegion | null>(null)
    const [intensity, setIntensity] = useState(0.8)

    return (
      <div className="relative w-full h-screen">
        <YouTubeWireframe
          {...args}
          content={defaultContent}
          focusRegion={focusRegion}
          focusIntensity={intensity}
          onRegionClick={(region) => {
            setFocusRegion(focusRegion === region ? null : region)
          }}
        />

        {/* Control Panel */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-4 rounded-lg shadow-lg space-y-3 min-w-[200px]">
          <div className="text-sm font-semibold text-gray-700">
            Focus Controls
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-600 block">
              Intensity: {Math.round(intensity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="text-xs text-gray-500">
            {focusRegion ? (
              <>
                Focused: <strong>{focusRegion}</strong>
              </>
            ) : (
              "Click any region to focus"
            )}
          </div>

          {focusRegion && (
            <button
              onClick={() => setFocusRegion(null)}
              className="w-full text-xs bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              Reset Focus
            </button>
          )}
        </div>
      </div>
    )
  },
  args: {
    transitionMs: 300,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Interactive demo with intensity slider. Click regions to focus, adjust intensity from 0-100%.",
      },
    },
  },
}

/* -----------------------------------------------------
 * Animation speed comparisons
 * --------------------------------------------------- */
export const FastTransition: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "mainContent",
    focusIntensity: 1,
    transitionMs: 150,
  },
  parameters: {
    docs: {
      description: {
        story: "Quick, snappy transition (150ms)",
      },
    },
  },
}

export const SlowTransition: Story = {
  render: (args) => <YouTubeWireframe {...args} content={defaultContent} />,
  args: {
    focusRegion: "video",
    focusIntensity: 1,
    transitionMs: 800,
  },
  parameters: {
    docs: {
      description: {
        story: "Slow, dramatic transition (800ms)",
      },
    },
  },
}

/* -----------------------------------------------------
 * Animated intensity progression
 * --------------------------------------------------- */
export const AnimatedIntensity: Story = {
  render: (args) => {
    const [intensity, setIntensity] = useState(0)

    const handleNext = () => {
      setIntensity((prev) => {
        const next = prev + 0.25
        return next > 1 ? 0 : next
      })
    }

    return (
      <div className="relative w-full h-screen">
        <YouTubeWireframe
          {...args}
          content={defaultContent}
          focusRegion="video"
          focusIntensity={intensity}
          transitionMs={400}
        />

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg space-x-4 flex items-center">
          <div className="text-sm text-gray-600">
            Intensity: <strong>{Math.round(intensity * 100)}%</strong>
          </div>
          <button
            onClick={handleNext}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            Next Step
          </button>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Cycles through intensity levels: 0% → 25% → 50% → 75% → 100%. Click to advance.",
      },
    },
  },
}

/* -----------------------------------------------------
 * Multi-region sequence
 * --------------------------------------------------- */
export const AnimatedSequence: Story = {
  render: (args) => {
    const [step, setStep] = useState(0)

    const sequence: Array<{ region: YouTubeRegion | null; intensity: number }> =
      [
        { region: null, intensity: 0 },
        { region: "video", intensity: 0.6 },
        { region: "video", intensity: 1 },
        { region: "mainContent", intensity: 0.8 },
        { region: "sidebarTop", intensity: 1 },
        { region: null, intensity: 0 },
      ]

    const current = sequence[step % sequence.length]

    return (
      <div className="relative w-full h-screen">
        <YouTubeWireframe
          {...args}
          content={defaultContent}
          focusRegion={current.region}
          focusIntensity={current.intensity}
          transitionMs={500}
        />

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg">
          <button
            onClick={() => setStep((s) => s + 1)}
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Next Step ({(step % sequence.length) + 1}/{sequence.length})
          </button>
        </div>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "Cycles through different focus states with varying intensities. Click to advance.",
      },
    },
  },
}
