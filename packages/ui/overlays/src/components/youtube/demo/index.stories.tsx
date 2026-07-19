import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ObsStatusPanel } from "."

type Story = StoryObj<typeof ObsStatusPanel>
type Meta = MetaObj<typeof ObsStatusPanel>

const meta = {
  title: "UI/Overlays/Components/ObsStatusPanel",
  component: ObsStatusPanel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta

export default meta

// Default story - standard configuration
export const Default: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: true,
    reconnectInterval: 5000,
    debugMode: false,
  },
}

// Debug mode enabled - shows additional debugging information
export const DebugMode: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: true,
    reconnectInterval: 5000,
    debugMode: true,
  },
}

// Fast reconnect - demonstrates quick reconnection attempts
export const FastReconnect: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: true,
    reconnectInterval: 1000,
    debugMode: true,
  },
}

// No auto-reconnect - manual connection management
export const NoAutoReconnect: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: false,
    reconnectInterval: 5000,
    debugMode: true,
  },
}

// Custom URL - demonstrates connecting to different server
export const CustomUrl: Story = {
  args: {
    url: "ws://localhost:4000/obs",
    autoReconnect: true,
    reconnectInterval: 5000,
    debugMode: false,
  },
}

// With callbacks - demonstrates event handling
export const WithCallbacks: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: true,
    reconnectInterval: 5000,
    debugMode: true,
    onConnect: () => {
      // eslint-disable-next-line no-console
      console.log("✅ Connected to OBS WebSocket")
      alert("Connected to OBS!")
    },
    onDisconnect: () => {
      // eslint-disable-next-line no-console
      console.log("❌ Disconnected from OBS WebSocket")
      alert("Disconnected from OBS!")
    },
    onError: (error: Event | Error) => {
      // eslint-disable-next-line no-console
      console.error("🚨 OBS WebSocket Error:", error)
      alert(`Error:`)
    },
  },
}

// Slow reconnect - demonstrates longer reconnection intervals
export const SlowReconnect: Story = {
  args: {
    url: `ws://${window.location.hostname}:3000/ws`,
    autoReconnect: true,
    reconnectInterval: 10000,
    debugMode: true,
  },
}

// Production config - optimized for production use
export const ProductionConfig: Story = {
  args: {
    url: `wss://${window.location.hostname}/ws`,
    autoReconnect: true,
    reconnectInterval: 3000,
    debugMode: false,
  },
}

// Development config - optimized for development
export const DevelopmentConfig: Story = {
  args: {
    url: "ws://localhost:3000/ws",
    autoReconnect: true,
    reconnectInterval: 2000,
    debugMode: true,
    // eslint-disable-next-line no-console
    onConnect: () => console.log("Dev: Connected"),
    // eslint-disable-next-line no-console
    onDisconnect: () => console.log("Dev: Disconnected"),
    // eslint-disable-next-line no-console
    onError: (error: Event | Error) => console.error("Dev Error:", error),
  },
}
