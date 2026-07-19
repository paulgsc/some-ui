/**
 * Comfort Lab scoring UI (#727) — the human side of the independent oracle
 * #726 asks for. Storybook is the review surface, not the source of truth;
 * this component is where a human actually looks at a rendered fixture
 * (the iframe in `ComfortFixture.stories.tsx`) and records an "eye score."
 *
 * Blind mode: the fixture's recorded label/expected verdict is hidden until
 * "Reveal recorded label" is clicked, so a reviewer scores what they
 * actually see, not what the corpus file already claims. What's revealed is
 * `corpus.ts`'s own hand-verified `expectAlreadyDark`/`expectComfortable`
 * fields (#724) — not a live re-run of the classifier — because those
 * functions read the *ambient* `document` (see `theme-detector.ts`), not an
 * arbitrary iframe's document; running the real classifier against the
 * iframe would need the same esbuild-bundle-and-inject machinery the
 * Playwright harness uses, which is more infrastructure than this story
 * needs. The actual classifier-vs-eye-score comparison happens in
 * Playwright (#730), not here.
 *
 * Persistence (#729) isn't built yet: "Download annotation" produces a
 * standalone JSON file via a plain browser download — no server, no change
 * to the shared root `.storybook/main.ts`. Merging it into a committed
 * `eye-scores.json` is #729's job.
 */

import { useMemo, useState } from "react"

import type { CorpusFixture } from "../../tests/e2e/fixtures/corpus"
import {
  computeOverall,
  eyeScoreVerdict,
  requiresExplanation,
  validateEyeScore,
  type EyeScore,
  type EyeSubScores,
} from "../../tests/e2e/fixtures/eye-score"

const DEFAULT_SUB_SCORE = 50

const SUB_SCORE_FIELDS: ReadonlyArray<{
  readonly key: keyof EyeSubScores
  readonly label: string
  readonly hint: string
}> = [
  {
    key: "luminanceComfort",
    label: "Luminance",
    hint: "Is the background/foreground brightness balance comfortable?",
  },
  {
    key: "contrastComfort",
    label: "Contrast",
    hint: "Is the contrast readable without being harsh?",
  },
  {
    key: "colorComfort",
    label: "Color tone",
    hint: "Do the colors feel warm/neutral rather than clinical or garish?",
  },
  {
    key: "emotionalComfort",
    label: "Eye strain",
    hint: "Could you look at this for a while without discomfort?",
  },
]

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export type EyeScorePanelProps = {
  readonly fixture: CorpusFixture
}

export const EyeScorePanel = ({
  fixture,
}: EyeScorePanelProps): React.JSX.Element => {
  const [scores, setScores] = useState<EyeSubScores>({
    luminanceComfort: DEFAULT_SUB_SCORE,
    contrastComfort: DEFAULT_SUB_SCORE,
    colorComfort: DEFAULT_SUB_SCORE,
    emotionalComfort: DEFAULT_SUB_SCORE,
  })
  const [notes, setNotes] = useState("")
  const [reviewer, setReviewer] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [saved, setSaved] = useState(false)

  const overall = useMemo(() => computeOverall(scores), [scores])
  const verdict = eyeScoreVerdict(overall)

  const draft: EyeScore = {
    ...scores,
    overall,
    reviewer,
    notes,
    scoredAt: new Date().toISOString(),
  }
  const issues = validateEyeScore(fixture, draft)
  const needsExplanation = requiresExplanation(fixture, draft)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: 360,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <p style={{ margin: 0, opacity: 0.7 }}>
        Score what you see, with no other context. Reveal only after you have
        scored — seeing the recorded label first biases the score.
      </p>

      {SUB_SCORE_FIELDS.map(({ key, label, hint }) => (
        <label
          key={key}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span>
            {label}: <strong>{scores[key]}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={scores[key]}
            onChange={(event) => {
              setSaved(false)
              const value = Number(event.target.value)
              setScores((previous) => ({ ...previous, [key]: value }))
            }}
          />
          <span style={{ opacity: 0.6 }}>{hint}</span>
        </label>
      ))}

      <div>
        Overall: <strong>{overall}</strong> ({verdict})
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Reviewer
        <input
          type="text"
          value={reviewer}
          placeholder="your name/handle"
          onChange={(event) => {
            setSaved(false)
            setReviewer(event.target.value)
          }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>
          Notes
          {needsExplanation && (
            <strong style={{ color: "#b91c1c" }}>
              {" "}
              (required — your score disagrees with the recorded label)
            </strong>
          )}
        </span>
        <textarea
          value={notes}
          rows={3}
          placeholder="Why this score? Cite what you actually see, not the label."
          onChange={(event) => {
            setSaved(false)
            setNotes(event.target.value)
          }}
        />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={revealed}
          onClick={() => setRevealed(true)}
        >
          Reveal recorded label
        </button>
        <button
          type="button"
          disabled={issues.length > 0}
          onClick={() => {
            downloadJson(`${fixture.id}.eyescore.json`, { [fixture.id]: draft })
            setSaved(true)
          }}
        >
          Download annotation
        </button>
      </div>

      {issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#b91c1c" }}>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {saved && (
        <p style={{ margin: 0, color: "#15803d" }}>
          Downloaded — merge into eye-scores.json (#729).
        </p>
      )}

      {revealed && (
        <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
          <div>Grammar: {fixture.grammar}</div>
          <div>Recorded label: {fixture.label}</div>
          <div>
            expectAlreadyDark: {String(fixture.expectAlreadyDark)},
            expectComfortable: {String(fixture.expectComfortable)}
          </div>
          {fixture.expectComfortable !== null && (
            <div>
              Your score implies <strong>{verdict}</strong> —{" "}
              {verdict === "borderline"
                ? "borderline, not compared against the recorded label"
                : (verdict === "comfortable") === fixture.expectComfortable
                  ? "agrees with the recorded label"
                  : "disagrees with the recorded label"}
            </div>
          )}
          <div style={{ opacity: 0.7, marginTop: 4 }}>{fixture.note}</div>
        </div>
      )}
    </div>
  )
}
