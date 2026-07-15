import type { UseAudioRecorderReturn } from "@interview/hooks/use-audio-recorder"
import type { RecordingState } from "@interview/types/interview"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RecordingPhase } from "."

const noop = (): void => {}
const asyncNoop = async (): Promise<void> => {}

const buildRecording = (
  state: RecordingState,
  overrides: Partial<UseAudioRecorderReturn> = {}
): UseAudioRecorderReturn => ({
  state,
  elapsedTime: 0,
  stream: null,
  startRecording: asyncNoop,
  pauseRecording: noop,
  resumeRecording: noop,
  stopRecording: asyncNoop,
  reset: noop,
  retry: noop,
  ...overrides,
})

const question =
  "Describe your approach to designing a scalable URL shortener service."

const meta = {
  title: "UI/Chat/Interview/RecordingPhase",
  component: RecordingPhase,
  parameters: {
    docs: {
      description: {
        component:
          "Every mic state is driven by a stubbed `recording` prop, so this can be reviewed without granting real microphone access.",
      },
    },
  },
} satisfies Meta<typeof RecordingPhase>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: {
    question,
    recording: buildRecording({ type: "idle" }),
  },
}

export const RequestingPermission: Story = {
  args: {
    question,
    recording: buildRecording({ type: "requesting_permission" }),
  },
}

export const PermissionDenied: Story = {
  args: {
    question,
    recording: buildRecording({
      type: "permission_denied",
      error:
        "Microphone permission denied. Please enable access in your browser.",
    }),
  },
}

export const Recording: Story = {
  args: {
    question,
    recording: buildRecording(
      { type: "recording", startTime: Date.now() },
      { elapsedTime: 42 }
    ),
  },
}

export const Paused: Story = {
  args: {
    question,
    recording: buildRecording(
      { type: "paused", startTime: Date.now(), elapsedBeforePause: 37 },
      { elapsedTime: 37 }
    ),
  },
}

export const Processing: Story = {
  args: {
    question,
    recording: buildRecording({ type: "processing" }),
  },
}

export const Success: Story = {
  args: {
    question,
    recording: buildRecording({
      type: "success",
      audioBlob: new Blob(),
      audioUrl: "",
      duration: 58,
    }),
  },
}

export const ErrorState: Story = {
  args: {
    question,
    recording: buildRecording({
      type: "error",
      error: "Network error: Failed to upload recording",
      canRetry: true,
    }),
  },
}
