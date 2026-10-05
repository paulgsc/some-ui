import type { RoundNote } from "@leetype/lib/leetype/notes"
import type { ComposerState } from "@leetype/lib/leetype/notes/composer"
import {
  COMPOSER_NOTICES,
  initialComposerState,
} from "@leetype/lib/leetype/notes/composer"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { NoteButton, NoteComposer } from "."

const meta: Meta<typeof NoteComposer> = {
  title: "UI/Input/Components/Round/NoteComposer",
  component: NoteComposer,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof NoteComposer>

const NOTE: RoundNote = {
  id: "n-story",
  at: "2026-10-03T12:00:00.000Z",
  kind: "unclear",
  text: "",
  spoken: false,
  anchor: {
    roundId: "count-present-sorted-lookup",
    own: false,
    artifact: "diffSet",
    picked: 1,
    committed: false,
    sessionId: "s-story",
  },
}

const Phone = ({
  state,
  recognizer,
}: {
  state: ComposerState
  recognizer: "browser" | "phone" | null
}) => (
  <div className="mx-auto flex w-full max-w-[390px] flex-col gap-2 p-3">
    <div className="flex items-center justify-end border-b border-border/60">
      <NoteButton
        label="Rewrites"
        open={state.composer.phase !== "closed"}
        onPress={() => undefined}
      />
    </div>
    <NoteComposer
      state={state}
      dispatch={() => undefined}
      recognizer={recognizer}
    />
  </div>
)

/** The first tap: four kinds, any one of which is a complete note. */
export const Choosing: Story = {
  render: () => (
    <Phone
      recognizer="browser"
      state={{
        ...initialComposerState(true),
        composer: { phase: "choosing", anchor: NOTE.anchor },
      }}
    />
  ),
}

/** Saved, with words optional: speak (the phone's recognizer) or type. */
export const NotedOnThePhone: Story = {
  render: () => (
    <Phone
      recognizer="phone"
      state={{
        ...initialComposerState(true),
        notice: COMPOSER_NOTICES.saved,
        composer: {
          phase: "noted",
          note: NOTE,
          voice: { kind: "idle" },
          closing: false,
        },
      }}
    />
  ),
}

/** Mid-utterance in a browser: the words so far, and Stop. */
export const Listening: Story = {
  render: () => (
    <Phone
      recognizer="browser"
      state={{
        ...initialComposerState(true),
        composer: {
          phase: "noted",
          note: { ...NOTE, text: "which bound is new?" },
          voice: { kind: "listening", seq: 1, heard: "and why does it matter" },
          closing: false,
        },
      }}
    />
  ),
}

/** No recognizer (Firefox): typing only, and no disclosure to make. */
export const TypingOnly: Story = {
  render: () => (
    <Phone
      recognizer={null}
      state={{
        ...initialComposerState(false),
        notice: COMPOSER_NOTICES.denied,
        composer: {
          phase: "noted",
          note: { ...NOTE, kind: "gap", text: "never seen this rewrite" },
          voice: { kind: "idle" },
          closing: false,
        },
      }}
    />
  ),
}
