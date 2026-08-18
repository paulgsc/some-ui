import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import { defaultDraft } from "@drama/components/form-opinionated/use-drama-journal-state"
import type { JournalDraft } from "@drama/components/form-opinionated/use-drama-journal-state"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildPreviewCard } from "."

type BridgeProps = {
  title: string
  episode: number
  before: string
  after: string
  tags: Array<"confession" | "reunion" | "betrayal" | "sacrifice">
  rating: number
}

const PreviewCardBridge = ({
  title,
  episode,
  before,
  after,
  tags,
  rating,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const draft: JournalDraft = {
      ...defaultDraft({}),
      title,
      episode,
      transition: { before, after },
      tags,
      rating,
    }

    const { root } = buildPreviewCard(draft)

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [title, episode, before, after, tags, rating])

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 0",
        background: "var(--moon-900)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div ref={containerRef} />
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/PreviewCard",
  component: PreviewCardBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    episode: { control: { type: "number", min: 0 } },
    before: { control: "text" },
    after: { control: "text" },
    tags: {
      control: "check",
      options: ["confession", "reunion", "betrayal", "sacrifice"],
    },
    rating: { control: { type: "range", min: 0, max: 10, step: 1 } },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const EmptyState: Story = {
  args: { title: "", episode: 0, before: "", after: "", tags: [], rating: 0 },
}

export const Filled: Story = {
  args: {
    title: "Crash Landing on You",
    episode: 12,
    before: "Distrust",
    after: "Trust",
    tags: ["confession", "reunion"],
    rating: 8,
  },
}

export const FullStars: Story = {
  args: {
    title: "Twenty-Five Twenty-One",
    episode: 14,
    before: "Isolation",
    after: "Belonging",
    tags: ["sacrifice"],
    rating: 10,
  },
}
