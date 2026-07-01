import { useFormattedCode } from "@input/hooks/leetype/use-formatted-code"
import { codeToUnits, sliceUserUnits } from "@input/utils/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CodeDisplay } from "."

const meta: Meta<typeof CodeDisplay> = {
  title: "UI/Input/Components/Typing/CodeDisplay",
  component: CodeDisplay,
  argTypes: {
    language: {
      control: "select",
      options: ["typescript", "rust", "cpp", "c"],
    },
  },
}

export default meta
type Story = StoryObj<typeof CodeDisplay>

/* ---------- Story wrapper ---------- */

const StoryFromFile = ({
  path,
  language,
  typedChars,
}: {
  path: string
  language: string
  typedChars: number
}) => {
  // Determine the Prettier parser
  const prettierParser =
    language === "typescript" || language === "c"
      ? "typescript"
      : language === "rust"
        ? "rust"
        : "babel"

  // Consume the full FSM state
  const state = useFormattedCode(path, {
    prettierParser: prettierParser,
  })

  // --- Handle FSM States ---

  switch (state.status) {
    case "IDLE":
      // Initial render, or when path is empty
      return (
        <div style={{ padding: "20px", color: "#888" }}>Initializing...</div>
      )

    case "LOADING":
      // Show loading state, indicating the current attempt number for retries
      return (
        <div
          style={{
            padding: "20px",
            color: "#007aff",
            border: "1px solid #007aff",
            borderRadius: "4px",
          }}
        >
          ⏳ **Loading Code...** (Attempt {state.attempt})
        </div>
      )

    case "ERROR":
      // Show the final error state, leveraging the typestate's guaranteed error object
      return (
        <div
          style={{
            padding: "20px",
            color: "#ff3b30",
            border: "1px solid #ff3b30",
            borderRadius: "4px",
          }}
        >
          ❌ **Failed to Load Code** ❌
          <p style={{ margin: "5px 0 0" }}>**Path:** `{path}`</p>
          <details>
            <summary>Error Details</summary>
            <code
              style={{
                display: "block",
                whiteSpace: "pre-wrap",
                marginTop: "5px",
              }}
            >
              {state.error.message}
            </code>
          </details>
        </div>
      )

    case "SUCCESS": {
      // Type-safe: TS guarantees state.code is a string
      const targetUnits = codeToUnits(state.code)
      const userUnits = sliceUserUnits(targetUnits, typedChars)

      return (
        <CodeDisplay
          className={"code"}
          displayCode={state.code}
          language={language}
          targetUnits={targetUnits}
          userUnits={userUnits}
          cursorUnitIndex={typedChars}
        />
      )
    }

    default:
      // Should be unreachable
      return (
        <div style={{ padding: "20px", color: "gray" }}>Unknown State...</div>
      )
  }
}

/* ---------- Stories ---------- */

export const TypescriptIdle: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/two-sum.ts"
      language="typescript"
      typedChars={0}
    />
  ),
}

export const TypescriptPartial: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/fibonacci.ts"
      language="typescript"
      typedChars={42}
    />
  ),
}

export const TypescriptMidScroll: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/fibonacci.ts"
      language="typescript"
      typedChars={180}
    />
  ),
}

export const RustTyping: Story = {
  render: () => (
    <StoryFromFile
      path="/code-samples/factorial.rs"
      language="rust"
      typedChars={35}
    />
  ),
}
