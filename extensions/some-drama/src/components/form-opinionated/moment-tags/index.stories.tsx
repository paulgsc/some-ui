import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { MomentTag } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildMomentTagsSection } from "."

type BridgeProps = {
  initialTags: Array<MomentTag>
}

const MomentTagsBridge = ({ initialTags }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Array<MomentTag>>(initialTags)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildMomentTagsSection({ tags: initialTags }, (patch) => {
      if (patch.tags) setSelected(patch.tags)
    })

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [initialTags])

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "40px 0",
        background: "var(--moon-900)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div ref={containerRef} />
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.4)",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        selected: {selected.join(", ") || "—"}
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/MomentTags",
  component: MomentTagsBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    initialTags: {
      control: "check",
      options: [
        "confession",
        "reunion",
        "betrayal",
        "sacrifice",
        "separation",
        "kiss",
        "rivalry",
        "other",
      ],
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Empty: Story = {
  args: { initialTags: [] },
}

export const SomeSelected: Story = {
  args: { initialTags: ["confession", "reunion"] },
}
