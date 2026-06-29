// RecordingPhase.stories.tsx
import type { ComponentProps } from "react"
import { useEffect, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RecordingPhase } from "."

// 🌐 CRITICAL: Global iframe permission config (applies to ALL stories needing mic)
const meta = {
  title: "UI/Chat/Interview/RecordingPhase",
  component: RecordingPhase,
  parameters: {
    // ✨ THIS IS THE KEY THAT BUSTS THE MYTH ✨
    iframe: {
      allow: "microphone",
    },
    // Optional: Prevent accidental mic spam during story browsing
    chromatic: { disableSnapshot: true },
  },
  argTypes: {
    onComplete: {
      action: "transcript-submitted",
      description: "Called when recording is processed with final transcript",
    },
    question: {
      control: "text",
      defaultValue:
        "Describe your approach to designing a scalable URL shortener service.",
    },
  },
} satisfies Meta<typeof RecordingPhase>

export default meta
type Story = StoryObj<typeof meta>

// 🎯 PRIMARY STORY: REAL MICROPHONE WORKFLOW (Mythbuster Proof)
export const Default: Story = {
  args: {
    onComplete: () => {},
  },
  // 💡 Pro Tip: Add visual cue that interaction is required
  parameters: {
    docs: {
      description: {
        story:
          "✅ **MICROPHONE WORKS IN STORYBOOK!**\n\n" +
          "1. Click 'Start speaking' button (user gesture required by browser)\n" +
          "2. Grant microphone permission when prompted\n" +
          "3. Recording UI will activate immediately\n\n" +
          "*Requires localhost or HTTPS. If prompt doesn't appear:*\n" +
          "- Check browser permissions (chrome://settings/content/microphone)\n" +
          "- Ensure Storybook is running on http://localhost",
      },
    },
  },
}

// 🎭 SMART MOCK: Permission Denied State (No real mic needed)
export const PermissionDenied: Story = {
  ...Default,
  render: (args: ComponentProps<typeof RecordingPhase>) => {
    // Mock ONLY for this story - doesn't affect other stories
    const [isMockActive, setIsMockActive] = useState(false)

    useEffect(() => {
      if (!isMockActive) return

      // Temporarily override getUserMedia to reject
      const original = navigator.mediaDevices.getUserMedia
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"))

      return () => {
        navigator.mediaDevices.getUserMedia = original
      }
    }, [isMockActive])

    return (
      <div className="p-4 border-l-4 border-destructive/20 bg-destructive/5 rounded-r">
        <p className="text-sm text-destructive mb-2 font-medium">
          🎯 Mock Mode Active: Click button below to simulate permission denial
        </p>
        <button
          onClick={() => setIsMockActive(true)}
          className="mb-4 px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition"
        >
          Activate Permission Denied Mock
        </button>
        {isMockActive && <RecordingPhase {...args} />}
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          "🛡️ **Safe preview of permission denied state**\n\n" +
          "1. Click 'Activate Permission Denied Mock' button\n" +
          "2. Then click 'Start speaking' in component\n" +
          "3. UI instantly shows denial state (no browser prompt)\n\n" +
          "*Real microphone never requested - safe for CI/docs*",
      },
    },
  },
}

// 📦 BONUS: Success State Mock (Show completed flow)
export const SuccessState: Story = {
  render: () => {
    // Simulate success state without recording
    const [state, setState] = useState<"idle" | "success">("idle")

    if (state === "idle") {
      return (
        <div className="p-8 text-center">
          <button
            onClick={() => setState("success")}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90"
          >
            Show Success State Mock
          </button>
          <p className="mt-2 text-sm text-muted-foreground">
            (Simulates post-recording UI with audio player)
          </p>
        </div>
      )
    }

    // Hardcoded success state data
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="max-w-3xl w-full space-y-6">
          <div className="p-8 md:p-12 space-y-8 bg-card border border-border rounded-lg shadow-sm">
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-medium text-foreground">
                  The question
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Describe your approach to designing a scalable URL shortener
                  service.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center space-y-8 py-8">
                <div className="w-full space-y-4">
                  {/* Mock audio player with placeholder */}
                  <div className="border rounded-lg p-4 bg-muted flex items-center justify-center">
                    <span className="text-muted-foreground">
                      🔊 Mock Audio Player (Success State)
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Uploading and transcribing...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  parameters: {
    iframe: { allow: "" }, // No mic needed for this mock
    docs: {
      description: {
        story:
          "✅ **Completed flow preview** - Shows UI after successful recording/upload",
      },
    },
  },
}
