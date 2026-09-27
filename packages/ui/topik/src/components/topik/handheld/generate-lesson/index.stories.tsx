import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import { buildLessonPrompt } from "@topik/lib/topik/generation"

import { GenerateLesson } from "."

type Story = StoryObj<typeof GenerateLesson>
type Meta = MetaObj<typeof GenerateLesson>

const noop = (): void => undefined

const fenced = (value: unknown): string =>
  ["```json", JSON.stringify(value, null, 2), "```"].join("\n")

const entry = {
  key: "first-dinner",
  displayName: "The first family dinner",
  description: "Seo-yeon meets Chairman Kang, who has already decided.",
  tags: ["topik-2", "makjang"],
}

/** The fixture, with a build probe that asks for the line it was given. */
const flawed = structuredClone(FIXTURE_BATCHES).map((batch) => ({
  ...batch,
  probes: batch.probes?.map((probe) =>
    probe.kind === "build" ? { ...probe, target: probe.source } : probe
  ),
}))

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/GenerateLesson",
  component: GenerateLesson,
  args: {
    defaultLevel: 2,
    buildPrompt: buildLessonPrompt,
    onSave: noop,
    short: false,
  },
  // The applet owns the whole screen on a phone; Storybook's padding would
  // push its dock below the fold and misreport the layout.
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-svh w-full flex-col">
        <Story />
      </div>
    ),
  ],
}
export default meta

export const AskYourModel: Story = {}

export const Checked: Story = {
  args: { initialReply: `${fenced(FIXTURE_BATCHES)}\n${fenced(entry)}` },
}

/** The tallest stage: findings listed, and the fixes to send back. */
export const WithFindings: Story = {
  args: { initialReply: `${fenced(flawed)}\n${fenced(entry)}` },
}

export const NotALesson: Story = {
  args: { initialReply: "Sorry, I can only help with Korean grammar." },
}

export const WithFindingsLandscape: Story = {
  args: { ...WithFindings.args, short: true },
}
