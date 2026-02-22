/**
 * FloatingBar Storybook Stories
 * Fixes the "Objects are not valid as a React child" error by using React Refs.
 */

import "@drama/styles/content.css"

import { useEffect, useRef } from "react"
import type { EmotionType } from "@drama/types/schema"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "@storybook/test"

import { FloatingBar } from "."

const meta: Meta = {
  title: "Extensions/FloatingBar",
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
}

export default meta

type Story = StoryObj

// ============================================
// BRIDGE COMPONENT
// ============================================

/**
 * A helper component that acts as a bridge between React and your Vanilla class.
 */
const FloatingBarBridge = ({
  emotion = "happy" as EmotionType,
  rating = 4.5,
  episode = 1,
  isExpanded = false,
  onClick = () => {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const barInstance = useRef<FloatingBar | null>(null)

  useEffect(() => {
    if (containerRef.current && !barInstance.current) {
      // Initialize class
      barInstance.current = new FloatingBar(onClick)
      barInstance.current.mount(containerRef.current)
    }

    // Update whenever props change
    if (barInstance.current) {
      barInstance.current.update(
        emotion,
        rating,
        episode,
        Date.now(),
        isExpanded
      )
    }

    return () => {
      if (barInstance.current) {
        barInstance.current.unmount()
        barInstance.current = null
      }
    }
  }, [emotion, rating, episode, isExpanded])

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "200px",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    />
  )
}

// ============================================
// STORIES
// ============================================

export const Default: Story = {
  render: () => <FloatingBarBridge />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => {
      expect(
        canvasElement.querySelector("#drama-sentiment-floating-bar")
      ).toBeInTheDocument()
    })
    expect(canvas.getByText("4.5")).toBeVisible()
  },
}

export const AllEmotions: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <FloatingBarBridge emotion="happy" rating={5.0} />
      <FloatingBarBridge emotion="sad" rating={2.0} />
      <FloatingBarBridge emotion="angry" rating={1.0} />
      <FloatingBarBridge emotion="surprised" rating={4.0} />
    </div>
  ),
}

export const ExpandedState: Story = {
  render: () => <FloatingBarBridge isExpanded={true} />,
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector("#drama-sentiment-floating-bar")
    // Your class adds the "hidden" class when isExpanded is true
    expect(bar).toHaveClass("hidden")
  },
}

export const Interaction: Story = {
  render: () => {
    const handleClick = () => alert("Bar Clicked!")
    return <FloatingBarBridge onClick={handleClick} rating={4.8} episode={12} />
  },
  play: async ({ canvasElement }) => {
    const bar = canvasElement.querySelector(
      "#drama-sentiment-floating-bar"
    ) as HTMLElement
    await userEvent.click(bar)
  },
}
