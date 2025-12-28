import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { Headline } from "."

type Story = StoryObj<typeof Headline>
type Meta = MetaObj<typeof Headline>

export const Default: Story = {
  args: {
    className: "w-full",
    initialText: "Your headline here",
  },
  render: (args) => (
    <main className="w-full min-h-screen">
      <Headline {...args} />
    </main>
  ),
}

export const PeachBlossom: Story = {
  args: {
    className: "w-full",
    theme: "peach-blossom",
    initialText: "WARM EVENING LIGHT",
    storageKey: "headline-peach",
  },
  parameters: {
    docs: {
      description: {
        story: "Warm evening light through petals - soft coral and cherry blossom atmosphere",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen">
      <Headline {...args} />
    </main>
  ),
}

export const StrawberryMoon: Story = {
  args: {
    className: "w-full",
    theme: "strawberry-moon",
    initialText: "LUNAR BLOOM",
    storageKey: "headline-strawberry",
  },
  parameters: {
    docs: {
      description: {
        story: "Night sky tint with lunar bloom - mystical pink moonlight",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen">
      <Headline {...args} />
    </main>
  ),
}

export const DarkGold: Story = {
  args: {
    className: "w-full",
    theme: "dark-gold",
    initialText: "STUDIO LIGHT",
    storageKey: "headline-gold",
  },
  parameters: {
    docs: {
      description: {
        story: "Low-key studio lighting with metallic warmth and purple depth",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen">
      <Headline {...args} />
    </main>
  ),
}

export const LightingComparison: Story = {
  parameters: {
    docs: {
      description: {
        story: "All three light environments side by side - demonstrating atmospheric differences",
      },
    },
  },
  render: () => (
    <main className="w-full">
      <div className="space-y-0">
        <Headline
          theme="peach-blossom"
          initialText="PEACH BLOSSOM"
          storageKey="compare-peach"
          className="min-h-[350px]"
        />
        <Headline
          theme="strawberry-moon"
          initialText="STRAWBERRY MOON"
          storageKey="compare-strawberry"
          className="min-h-[350px]"
        />
        <Headline
          theme="dark-gold"
          initialText="DARK GOLD"
          storageKey="compare-gold"
          className="min-h-[350px]"
        />
      </div>
    </main>
  ),
}

export const LivestreamReady: Story = {
  args: {
    className: "w-full",
    theme: "dark-gold",
    initialText: "LIVE NOW",
    storageKey: "headline-live",
  },
  parameters: {
    docs: {
      description: {
        story: "Optimized for OBS/livestream - minimal motion, maximum presence",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen bg-black">
      <Headline {...args} />
    </main>
  ),
}

export const ShortForm: Story = {
  args: {
    className: "w-full min-h-[250px]",
    theme: "peach-blossom",
    initialText: "NOW",
    storageKey: "headline-short",
  },
  parameters: {
    docs: {
      description: {
        story: "Compact format for shorter text - still maintains atmospheric presence",
      },
    },
  },
  render: (args) => (
    <main className="w-full">
      <Headline {...args} />
    </main>
  ),
}

export const LongForm: Story = {
  args: {
    className: "w-full",
    theme: "strawberry-moon",
    initialText: "THE QUIET MOMENTS BETWEEN BREATHS",
    storageKey: "headline-long",
  },
  parameters: {
    docs: {
      description: {
        story: "Extended text - ambient drift keeps it feeling alive without distraction",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen">
      <Headline {...args} />
    </main>
  ),
}

export const Interactive: Story = {
  args: {
    className: "w-full",
    theme: "peach-blossom",
    initialText: "Click to edit",
    storageKey: "headline-edit",
  },
  parameters: {
    docs: {
      description: {
        story: "Editable headline - hover to reveal edit affordance",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen flex flex-col">
      <div className="p-8 bg-gray-50 text-center border-b">
        <p className="text-gray-600 text-sm">
          Hover over the headline to reveal edit indicator, click to modify text
        </p>
        <p className="text-gray-400 text-xs mt-2">
          Note: Motion is imperceptible unless you stare - this is intentional
        </p>
      </div>
      <Headline {...args} />
    </main>
  ),
}

export const CinematicPresence: Story = {
  args: {
    className: "w-full",
    theme: "dark-gold",
    initialText: "BREATHING LIGHT",
    storageKey: "headline-cinematic",
  },
  parameters: {
    docs: {
      description: {
        story: "Demonstrates 'still image that happens to be alive' - watch for 30+ seconds to feel the breath",
      },
    },
  },
  render: (args) => (
    <main className="w-full min-h-screen bg-black flex items-center justify-center">
      <Headline {...args} />
    </main>
  ),
}

export default {
  title: "UI/NeonSign/Components/Headline",
  component: Headline,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `
# Headline Component

Cinematic text presence for livestream viewports. Designed as **light environments**, not UI themes.

## Design Philosophy

- Motion should feel **ambient** - barely perceptible unless you stare
- Text is **one mass**, not individual animated letters  
- Effects read as **atmosphere**, not animation
- Optimized for **broadcast compression** (OBS, StreamLabs)

## Light Environments

- **Peach Blossom**: Warm evening light through petals
- **Strawberry Moon**: Night sky tint with lunar bloom  
- **Dark Gold**: Low-key studio lighting with purple depth

## Motion Characteristics

- **90s light drift** - gradient position shift
- **40s ambient drift** - sub-pixel camera breathing
- **30s text breathe** - optical bloom modulation
- **12-16s glitch** - rare signal interference (1-2 frames)
- **30s scan lines** - CRT texture, almost invisible

All motion is **perceptual, not visible**.
        `,
      },
    },
  },
  argTypes: {
    theme: {
      control: "select",
      options: ["peach-blossom", "strawberry-moon", "dark-gold"],
      description: "Light environment (not a visual theme)",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "peach-blossom" },
      },
    },
    initialText: {
      control: "text",
      description: "Default text content",
    },
    storageKey: {
      control: "text",
      description: "LocalStorage key for persistence",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
} as Meta
