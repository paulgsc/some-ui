import { useState } from "react"
import type { DisplayMode, Language } from "@leetype/types/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { GameBottomNav } from "."

const meta: Meta<typeof GameBottomNav> = {
  title: "UI/Input/Components/Typing/GameBottomNav",
  component: GameBottomNav,
  parameters: {
    docs: {
      description: {
        component:
          "The ergonomic that replaces always-visible settings/stats cards: condensed live stats plus icon buttons that open a settings sidebar (Sheet) or challenge info (Drawer), so the rest of the viewport stays dedicated to the code/input card.",
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof GameBottomNav>

const info = {
  title: "Two Sum",
  description:
    "Given an array of integers and a target, return the indices of the two numbers that add up to target.",
  tags: ["arrays", "hash-map"],
}

const Controlled = (props: {
  gameState: "idle" | "playing" | "finished" | "timeout"
  errors?: number
  settingsEnabled?: boolean
  displayModeLocked?: boolean
}) => {
  const [language, setLanguage] = useState<Language>("typescript")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [duration, setDuration] = useState(300)

  return (
    <GameBottomNav
      gameState={props.gameState}
      onStart={() => {}}
      onReset={() => {}}
      timeLeft={214}
      duration={duration}
      wpm={54}
      accuracy={96.5}
      progress={38}
      errors={props.errors ?? 0}
      chunkLabel="Chunk 1/3+"
      language={language}
      displayMode={displayMode}
      displayModeLocked={props.displayModeLocked ?? false}
      settingsEnabled={props.settingsEnabled ?? true}
      onLanguageChange={setLanguage}
      onDisplayModeChange={setDisplayMode}
      onDurationChange={setDuration}
      info={info}
    />
  )
}

export const Idle: Story = {
  render: () => <Controlled gameState="idle" />,
}

export const Playing: Story = {
  render: () => <Controlled gameState="playing" settingsEnabled={false} />,
}

export const PlayingWithErrors: Story = {
  render: () => (
    <Controlled gameState="playing" settingsEnabled={false} errors={7} />
  ),
}

export const Finished: Story = {
  render: () => <Controlled gameState="finished" settingsEnabled={false} />,
}

export const DisplayModeLocked: Story = {
  name: "Display mode locked (hard difficulty / adaptive)",
  render: () => (
    <Controlled gameState="playing" settingsEnabled={false} displayModeLocked />
  ),
}
