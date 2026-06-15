import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildAccordionGroup } from "."

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

type BridgeProps = {
  initiallyOpenIndex: 0 | 1 | 2
}

const makeBody = (text: string): HTMLElement => {
  const p = el("p")
  p.style.fontSize = "13px"
  p.style.color = "var(--dj-muted)"
  p.style.lineHeight = "1.6"
  p.textContent = text
  return p
}

const AccordionBridge = ({ initiallyOpenIndex }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildAccordionGroup(
      [
        {
          title: "What Happened?",
          body: makeBody("Tag the key moments of this episode."),
        },
        {
          title: "What Changed?",
          body: makeBody("Describe the before → after emotional shift."),
        },
        {
          title: "Why Did It Matter?",
          body: makeBody("Reflect on why this episode stuck with you."),
        },
      ],
      initiallyOpenIndex
    )

    container.innerHTML = ""
    container.appendChild(root)

    return () => {
      root.remove()
    }
  }, [initiallyOpenIndex])

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        padding: "40px 0",
        background: "var(--moon-900)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div ref={containerRef} />
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/Accordion",
  component: AccordionBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    initiallyOpenIndex: {
      control: "inline-radio",
      options: [0, 1, 2],
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const FirstOpen: Story = {
  args: { initiallyOpenIndex: 0 },
}

export const SecondOpen: Story = {
  args: { initiallyOpenIndex: 1 },
}

export const ThirdOpen: Story = {
  args: { initiallyOpenIndex: 2 },
}
