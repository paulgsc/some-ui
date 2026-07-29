import { useRef } from "react"
import { useFormattedCode } from "@leetype/hooks/leetype/use-formatted-code"
import { usePreviewGame } from "@leetype/hooks/leetype/use-preview-game"
import type { GameState } from "@leetype/types/leetype"
import { assertNever } from "@leetype/utils"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CodeInputCard } from "."

const EMPTY_ROLES = new Uint8Array()
const EMPTY_SLOTS = new Int32Array()

const meta: Meta<typeof CodeInputCard> = {
  title: "UI/Input/Components/Typing/CodeInputCard",
  component: CodeInputCard,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The merged code + input surface: the target code is always visible (subject to display-mode masking) and a hidden textarea anchored behind it captures keystrokes, so the whole card is the typing target — no separate input pane.",
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof CodeInputCard>

type StoryFromFileProps = {
  path: string
  language: string
  typedChars: number
  gameState: GameState
  displayMode?: "shown" | "hidden"
}

const StoryFromFile = ({
  path,
  language,
  typedChars,
  gameState,
  displayMode = "shown",
}: StoryFromFileProps) => {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const prettierParser =
    language === "typescript"
      ? "typescript"
      : language === "rust"
        ? "rust"
        : language === "cpp"
          ? "cpp"
          : "c"

  const state = useFormattedCode(path, { prettierParser })

  // Drives the real engine `typedChars` keystrokes in, so the story shows
  // the caret exactly where a player would find it — including where it
  // jumps an indentation run — instead of a hand-rolled approximation.
  const preview = usePreviewGame(
    state.status === "SUCCESS" ? state.code : "",
    typedChars
  )

  const { status } = state
  switch (status) {
    case "IDLE":
    case "LOADING": {
      return (
        <div style={{ height: "100vh" }}>
          <CodeInputCard
            status={status}
            loadError={null}
            path={path}
            onRetryLoad={() => {}}
            displayCode=""
            language={language}
            roles={EMPTY_ROLES}
            slotOfDisplay={EMPTY_SLOTS}
            slotStatus={EMPTY_ROLES}
            cursorDisplay={0}
            displayMode={displayMode}
            gameState="idle"
            onKey={() => {}}
            onBackspace={() => {}}
            rejection={null}
            inputRef={inputRef}
            elapsedTime={0}
            accuracy={100}
            progress={0}
          />
        </div>
      )
    }

    case "ERROR": {
      return (
        <div style={{ height: "100vh" }}>
          <CodeInputCard
            status="ERROR"
            loadError={state.error}
            path={path}
            onRetryLoad={() => {}}
            displayCode=""
            language={language}
            roles={EMPTY_ROLES}
            slotOfDisplay={EMPTY_SLOTS}
            slotStatus={EMPTY_ROLES}
            cursorDisplay={0}
            displayMode={displayMode}
            gameState="idle"
            onKey={() => {}}
            onBackspace={() => {}}
            rejection={null}
            inputRef={inputRef}
            elapsedTime={0}
            accuracy={100}
            progress={0}
          />
        </div>
      )
    }

    case "SUCCESS": {
      return (
        <div style={{ height: "100vh" }}>
          <CodeInputCard
            status={preview ? "SUCCESS" : "LOADING"}
            loadError={null}
            path={path}
            onRetryLoad={() => {}}
            displayCode={state.code}
            language={language}
            roles={preview?.roles ?? EMPTY_ROLES}
            slotOfDisplay={preview?.slotOfDisplay ?? EMPTY_SLOTS}
            slotStatus={preview?.slotStatus ?? EMPTY_ROLES}
            cursorDisplay={preview?.snapshot.cursorDisplay ?? 0}
            displayMode={displayMode}
            gameState={gameState}
            onKey={() => {}}
            onBackspace={() => {}}
            rejection={null}
            inputRef={inputRef}
            elapsedTime={42}
            accuracy={96.5}
            progress={preview?.snapshot.progress ?? 0}
          />
        </div>
      )
    }

    default: {
      status satisfies never
      assertNever(status)
    }
  }
}

export const Idle: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/two-sum.ts"
      language="typescript"
      typedChars={0}
      gameState="idle"
    />
  ),
}

export const Playing: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/two-sum.ts"
      language="typescript"
      typedChars={42}
      gameState="playing"
    />
  ),
}

export const HiddenModePlaying: Story = {
  name: "Playing — hidden mode",
  render: () => (
    <StoryFromFile
      path="/code-samples/two-sum.ts"
      language="typescript"
      typedChars={42}
      gameState="playing"
      displayMode="hidden"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Untyped characters are masked (whitespace preserved) so the shape of the code is still visible; already-typed characters stay fully revealed for correctness feedback.",
      },
    },
  },
}

export const Finished: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/two-sum.ts"
      language="typescript"
      typedChars={200}
      gameState="finished"
    />
  ),
}

export const Timeout: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/fibonacci.ts"
      language="typescript"
      typedChars={30}
      gameState="timeout"
    />
  ),
}

export const LoadError: Story = {
  render: () => (
    <StoryFromFile
      path="/invalid/nonexistent-file.ts"
      language="typescript"
      typedChars={0}
      gameState="idle"
    />
  ),
}
