import { useEffect, useRef, useState } from "react"
import { useFormattedCode } from "@leetype/hooks/leetype/use-formatted-code"
import {
  isWasmLoaded,
  loadWasm,
} from "@leetype/lib/leetype/leetype-wasm-loader"
import type { GameState } from "@leetype/types/leetype"
import { assertNever } from "@leetype/utils"
import { codeToUnits, sliceUserUnits } from "@leetype/utils/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CodeInputCard } from "."

// The display buffer (highlighting, masking, cursor) is only computed once
// the WASM module is loaded — outside the full Leetype game screen nothing
// triggers that load, so these stories kick it off themselves.
function useWasmReady(): boolean {
  const [ready, setReady] = useState(isWasmLoaded())

  useEffect(() => {
    if (ready) return
    void loadWasm().then(() => setReady(true))
  }, [ready])

  return ready
}

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
  const [userInput, setUserInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasmReady = useWasmReady()

  const prettierParser =
    language === "typescript" || language === "c"
      ? "typescript"
      : language === "rust"
        ? "rust"
        : "babel"

  const state = useFormattedCode(path, { prettierParser })

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
            targetUnits={[]}
            userUnits={[]}
            cursorUnitIndex={0}
            displayMode={displayMode}
            gameState="idle"
            userInput=""
            onInputChange={() => {}}
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
            targetUnits={[]}
            userUnits={[]}
            cursorUnitIndex={0}
            displayMode={displayMode}
            gameState="idle"
            userInput=""
            onInputChange={() => {}}
            inputRef={inputRef}
            elapsedTime={0}
            accuracy={100}
            progress={0}
          />
        </div>
      )
    }

    case "SUCCESS": {
      const targetUnits = codeToUnits(state.code)
      const userUnits = sliceUserUnits(targetUnits, typedChars)

      return (
        <div style={{ height: "100vh" }}>
          <CodeInputCard
            status={wasmReady ? "SUCCESS" : "LOADING"}
            loadError={null}
            path={path}
            onRetryLoad={() => {}}
            displayCode={state.code}
            language={language}
            targetUnits={targetUnits}
            userUnits={userUnits}
            cursorUnitIndex={typedChars}
            displayMode={displayMode}
            gameState={gameState}
            userInput={userInput}
            onInputChange={setUserInput}
            inputRef={inputRef}
            elapsedTime={42}
            accuracy={96.5}
            progress={(typedChars / targetUnits.length) * 100}
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
