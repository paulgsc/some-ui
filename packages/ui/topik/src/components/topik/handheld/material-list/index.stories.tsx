import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import type { TopikMetadata } from "@topik/lib/topik"
import { orderLessons } from "@topik/lib/topik/core/lesson-selection"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"

import { MaterialList } from "."

type Story = StoryObj<typeof MaterialList>
type Meta = MetaObj<typeof MaterialList>

const noop = (): void => undefined

const lesson = (
  key: string,
  displayName: string,
  level: number,
  size: number,
  description: string,
  relations: Array<string> = []
): TopikMetadata => ({
  key,
  displayName,
  description,
  batchCount: 3,
  totalQuestions: size,
  totalMessages: size * 4,
  tags: [
    `topik-${level}`,
    "makjang",
    ...relations.map((relation) => `relation:${relation}`),
  ],
})

const week = [
  lesson(
    "the-will",
    "The will is read",
    2,
    8,
    "The eldest son learns the company was never his."
  ),
  lesson(
    "first-dinner",
    "The first family dinner",
    2,
    4,
    "Seo-yeon meets Chairman Kang, who has already decided.",
    ["reason connective", "negation"]
  ),
  lesson(
    "engagement",
    "The engagement party",
    2,
    9,
    "Everyone is polite, because everyone is lying.",
    ["reason connective"]
  ),
  lesson(
    "hospital",
    "The hospital corridor",
    2,
    6,
    "Two sisters, one secret, and a doctor who talks too much."
  ),
  lesson("cafe", "Ordering at a café", 1, 3, "Requests, politely and less so."),
]

const blockedOnConnectives: Array<SurveyReport> = [
  {
    topikKey: "the-will",
    at: 1,
    level: 2,
    difficulty: "too-hard",
    stuck: [
      {
        batchId: 1,
        probeId: "c1-because",
        relations: ["reason connective"],
      },
    ],
  },
]

const meta: Meta = {
  title: "UI/Chat/Components/Topik/Handheld/MaterialList",
  component: MaterialList,
  args: {
    order: orderLessons(week, blockedOnConnectives, 2),
    others: week.filter((item) => item.tags?.includes("topik-1")),
    level: 2,
    onLevel: noop,
    loading: false,
    error: null,
    resume: null,
    onSelect: noop,
    onReload: noop,
    onCreate: noop,
    onForget: noop,
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

/**
 * Up next brings back what blocked them, and is the shorter of the two that
 * do, since the last one felt too hard.
 */
export const UpNext: Story = {}

export const FirstVisit: Story = {
  args: { order: orderLessons(week, [], 2) },
}

export const WithAPastedLesson: Story = {
  args: {
    pasted: lesson(
      "local:in-laws",
      "The in-laws arrive early",
      3,
      5,
      "Written by the learner's own model."
    ),
  },
}

export const Resuming: Story = {
  args: {
    resume: { topik: week[1] ?? lesson("x", "x", 2, 1, ""), conversation: 1 },
  },
}

export const NothingThisWeek: Story = { args: { order: [], others: [] } }
