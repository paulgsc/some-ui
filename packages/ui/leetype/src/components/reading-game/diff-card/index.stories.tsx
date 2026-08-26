import { DiffCard } from "@leetype/components/reading-game/diff-card"
import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises"
import { readingHunkOf } from "@leetype/lib/leetype/reading-probe"
import type { ReadingHunk } from "@leetype/lib/leetype/reading-probe"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta: Meta<typeof DiffCard> = {
  title: "UI/Input/Components/Reading/DiffCard",
  component: DiffCard,
  parameters: {
    // `fullscreen`, not `centered`: the centered layout adds its own padding
    // around the story, which at a 430px preview pushes a 390px card past the
    // viewport and makes the story itself report a horizontal page scroll —
    // a false failure for the ui-fit sweep, and a misleading preview for a
    // card whose whole contract is that the page never scrolls sideways.
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof DiffCard>

/** A phone's width, so every story is read at the size the card is designed for. */
const Phone = ({ hunk }: { hunk: ReadingHunk }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">
    <DiffCard hunk={hunk} />
  </div>
)

const hunkOf = (exerciseId: string, stepIndex = 0): ReadingHunk => {
  const exercise = ALL_FIXTURE_EXERCISES.find(
    (candidate) => candidate.id === exerciseId
  )
  const step = exercise?.steps[stepIndex]
  const hunk = step ? readingHunkOf(step) : null
  return hunk ?? { language: "rust", rows: [] }
}

/** A repair whose fault is an absence: added lines, no removed one. */
export const AdditionOnly: Story = {
  render: () => <Phone hunk={hunkOf("diagnostic-loop-progress")} />,
}

/** A multi-line guard clause — one locus, three added rows. */
export const MultiLineRepair: Story = {
  render: () => <Phone hunk={hunkOf("diagnostic-division-guard")} />,
}

/**
 * A step with no `diff` overlay. Every line is context and the card degrades
 * into a plain code card — the honest rendering for a step with no delta to
 * point at.
 */
export const NoHunkOverlay: Story = {
  render: () => <Phone hunk={hunkOf("construction-lazy-default")} />,
}

/**
 * The requirement the whole card is built around: code never wraps. This line
 * is far wider than any phone, and the card stays viewport-width while its
 * code region scrolls — with the line number and sign pinned so they survive
 * the scroll.
 */
export const LongLineScrolls: Story = {
  render: () => (
    <Phone
      hunk={{
        path: "src/some/deeply/nested/module/with/a/long/path/handler.ts",
        language: "typescript",
        rows: [
          {
            index: 0,
            kind: "context",
            text: "export function handle(request: Request): Response {",
            oldLine: 118,
            newLine: 118,
          },
          {
            index: 1,
            kind: "del",
            text: "  return respond(request, { status: 200, body: serialize(request.payload) })",
            oldLine: 119,
          },
          {
            index: 2,
            kind: "add",
            text: "  return respond(request, { status: 200, body: serialize(request.payload), headers: securityHeadersFor(request.origin) })",
            newLine: 119,
          },
          { index: 3, kind: "context", text: "}", oldLine: 120, newLine: 120 },
        ],
      }}
    />
  ),
}
