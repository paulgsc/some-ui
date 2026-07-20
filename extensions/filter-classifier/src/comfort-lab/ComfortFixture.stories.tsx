/**
 * Comfort Lab (#727) — one story per `CORPUS` fixture (#724), rendering the
 * exact `html()` string Playwright renders, with the scoring UI
 * (`EyeScorePanel`) alongside it.
 *
 * Named exports, not a generated/dynamic export object: Storybook's CSF3
 * indexer enumerates stories via static analysis of this file's named
 * exports, so a runtime-computed `export const stories = {...}` object
 * would not appear as separate sidebar entries — this had to be verified
 * against how the rest of this repo's stories are authored (every existing
 * `*.stories.tsx` uses explicit named exports, e.g.
 * `extensions/some-filter/src/popup/components/action-bar/index.stories.tsx`),
 * not assumed. The practical consequence: adding a fixture to `CORPUS`
 * requires adding its story export here too — not fully automatic yet. A
 * coverage check that fails loudly on a missing story (rather than this
 * silently drifting) is deferred to #731 (corpus expansion workflow).
 *
 * The fixture renders inside an `<iframe srcDoc>` rather than a bridged
 * vanilla-DOM component (the pattern every other story in this repo uses):
 * there is no component to bridge here, only a raw HTML string, and the
 * iframe gives real isolation — the fixture's own explicit `<html>`/`<body>`
 * backgrounds render exactly as Playwright sees them, with no Storybook
 * theme/CSS bleeding in.
 */

import type { Meta, StoryObj } from "@storybook/react-vite"

import { CORPUS, type CorpusFixture } from "../../tests/e2e/fixtures/corpus"
import { EyeScorePanel } from "./EyeScorePanel"

function findFixture(id: string): CorpusFixture {
  const fixture = CORPUS.find((entry) => entry.id === id)
  if (!fixture) {
    throw new Error(`Comfort Lab: no corpus fixture with id "${id}"`)
  }
  return fixture
}

const ComfortLabStory = ({
  fixtureId,
}: {
  fixtureId: string
}): React.JSX.Element => {
  const fixture = findFixture(fixtureId)

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <iframe
        title={fixture.id}
        srcDoc={fixture.html()}
        style={{
          width: 640,
          height: 480,
          border: "1px solid #333",
          background: "#fff",
        }}
      />
      <EyeScorePanel fixture={fixture} />
    </div>
  )
}

const meta: Meta = {
  title: "Extensions/FilterClassifier/Comfort Lab",
  // neutralCanvas (#735): keep the surrounding canvas fixed regardless of
  // the toolbar's Mode/Theme globals — see theme-decorator.tsx's withTheme.
  // A dark canvas left over from reviewing some other story biases the eye
  // score before the reviewer even looks at the fixture itself.
  parameters: { layout: "fullscreen", neutralCanvas: true },
}
export default meta

type Story = StoryObj

export const PlainLightCard: Story = {
  render: () => <ComfortLabStory fixtureId="plain-light-card" />,
}

export const DefaultSwatchRendered: Story = {
  render: () => <ComfortLabStory fixtureId="default-swatch-rendered" />,
}

export const DefaultSwatchLegacyText: Story = {
  render: () => <ComfortLabStory fixtureId="default-swatch-legacy-text" />,
}

export const MutedWarmDark: Story = {
  render: () => <ComfortLabStory fixtureId="muted-warm-dark" />,
}

export const SunGlareBadges: Story = {
  render: () => <ComfortLabStory fixtureId="sun-glare-badges" />,
}

export const CoolBluePreserveBand: Story = {
  render: () => <ComfortLabStory fixtureId="cool-blue-preserve-band" />,
}

export const BorderlineMidGray: Story = {
  render: () => <ComfortLabStory fixtureId="borderline-mid-gray" />,
}

export const TransparentAmbiguous: Story = {
  render: () => <ComfortLabStory fixtureId="transparent-ambiguous" />,
}

export const NeonTextModerateSurface: Story = {
  render: () => <ComfortLabStory fixtureId="neon-text-moderate-surface" />,
}
