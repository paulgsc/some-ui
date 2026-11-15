import type { JSX } from "react"
import { CodeCard } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
// eslint-disable-next-line import/no-unresolved -- provided by showcaseEvidencePlugin in vite.config.ts
import { EVIDENCE } from "virtual:showcase-evidence"

import { hasAudience } from "@/lib/build-profile"

import { SOURCE_ROOT, sourceUrl } from "./evidence"
import { OWNER_VOICE, WORDS as W } from "./words"

import "./showcase.css"

const Source = ({ path }: { path: string }): JSX.Element => (
  <a className="showcase-source" href={sourceUrl(path)}>
    {path} →
  </a>
)

export const ShowcasePage = (): JSX.Element => (
  <main className="showcase">
    <header className="showcase-header">
      <a className="showcase-name" href="#top">
        <span aria-hidden>pg.</span>
        {W.name}
      </a>
      <nav aria-label={W.nav}>
        <a href="#voice">{W.voiceLink}</a>
        <a href="#decisions">{W.questionsLink}</a>
        <a href="#over-time">{W.timelineLink}</a>
      </nav>
    </header>
    <section className="showcase-opening" id="top">
      <p className="showcase-kicker">{W.eyebrow}</p>
      <h1>
        {W.title}
        <br />
        <span>{W.titleEnd}</span>
      </h1>
      <div className="showcase-opening-note">
        <p>{W.intro}</p>
        <p>{W.decision}</p>
        <a href="#voice">{W.down}</a>
      </div>
      <span className="showcase-margin-note">{W.edition}</span>
    </section>
    <section
      className="showcase-voice"
      id="voice"
      aria-labelledby="voice-title"
    >
      <p className="showcase-kicker">{W.voiceNumber}</p>
      <div className="showcase-voice-grid">
        <div className="showcase-voice-copy">
          <h2 id="voice-title">{W.voiceTitle}</h2>
          <p>{W.voiceIntro}</p>
          <div className="showcase-flow" aria-hidden>
            <span>→</span>
            <span>●</span>
            <span>→</span>
          </div>
          <h3>{W.takesTitle}</h3>
          <p>{W.takesBody}</p>
          <Source path="packages/ui/soundbites/src/components/idea/index.tsx" />
        </div>
        <div className="showcase-call">
          <div className="showcase-tape">
            <span>{W.sample}</span>
            <span aria-hidden>◉</span>
          </div>
          <div className="showcase-script">
            <div className="showcase-signal" aria-hidden>
              {Array.from({ length: 37 }, (_, i) => (
                <i
                  key={i}
                  style={{ height: `${12 + ((i * 17 + i * i) % 59)}px` }}
                />
              ))}
            </div>
            <h3>{W.sampleTitle}</h3>
            <blockquote>{EVIDENCE.sampleSaid}</blockquote>
            <p>{W.sampleNote}</p>
          </div>
          {hasAudience("web") && (
            <details className="showcase-stage">
              <summary>
                {W.stageOpen}
                <span aria-hidden>＋</span>
              </summary>
              <iframe
                loading="lazy"
                title={W.stageTitle}
                src={`${import.meta.env.BASE_URL}call?week=sample&scene=board&record=true`}
              />
              <p>{W.stageClose}</p>
              <div className="showcase-stage-links">
                <Link to="/call" search={{ week: "sample", scene: "board" }}>
                  {W.stageLink}
                </Link>
                <Link to="/essay" search={{ week: "sample" }}>
                  {W.essayLink}
                </Link>
              </div>
            </details>
          )}
          <details className="showcase-stage">
            <summary>
              {W.motionOpen}
              <span aria-hidden>＋</span>
            </summary>
            <iframe
              loading="lazy"
              title={W.motionTitle}
              sandbox="allow-scripts"
              srcDoc={EVIDENCE.motionHtml}
            />
            <Source path="packages/video-motion/compositions/brand-v1/index.html" />
          </details>
          <Source path="packages/video-render/src/templates/conference-call/sample-week.json" />
        </div>
      </div>
      {OWNER_VOICE && (
        <figure>
          <figcaption>{OWNER_VOICE.label}</figcaption>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- audio-only, with a visible transcript below */}
          <audio controls preload="none" src={OWNER_VOICE.src} />
          <p>{OWNER_VOICE.transcript}</p>
        </figure>
      )}
    </section>
    <section
      className="showcase-decisions"
      id="decisions"
      aria-labelledby="decisions-title"
    >
      <p className="showcase-kicker">{W.questionsNumber}</p>
      <div className="showcase-section-heading">
        <h2 id="decisions-title">{W.questionsTitle}</h2>
        <p>{W.questionsIntro}</p>
      </div>
      <details className="showcase-question" open>
        <summary>
          <span className="showcase-question-index">01</span>
          {W.assuranceQuestion}
          <span className="showcase-plus" aria-hidden>
            ＋
          </span>
        </summary>
        <div className="showcase-answer">
          <p>{W.assuranceBody}</p>
          <div>
            <p className="showcase-kicker">{W.ledgerLabel}</p>
            <div className="showcase-counts">
              <div>
                <strong>{EVIDENCE.counts.total}</strong>
                <span>{W.total}</span>
              </div>
              <div>
                <strong>{EVIDENCE.counts.holds}</strong>
                <span>{W.holds}</span>
              </div>
              <div>
                <strong>{EVIDENCE.counts.other}</strong>
                <span>{W.gaps}</span>
              </div>
            </div>
            <Link className="showcase-text-link" to="/assurance">
              {W.ledgerLink}
            </Link>
            <Source path="packages/assurance/src/ledger.json" />
          </div>
        </div>
      </details>
      <details className="showcase-question">
        <summary>
          <span className="showcase-question-index">02</span>
          {W.driftQuestion}
          <span className="showcase-plus" aria-hidden>
            ＋
          </span>
        </summary>
        <div className="showcase-answer">
          <div>
            <p>{W.driftBody}</p>
            <Source path="CLAUDE.md" />
          </div>
          <div>
            <pre className="showcase-excerpt">{EVIDENCE.policy}</pre>
            <CodeCard
              code={EVIDENCE.decision}
              language="typescript"
              label={W.driftQuestion}
              appearance="code"
            />
            <Source path="docs/calls/C378.json" />
          </div>
        </div>
      </details>
      <details className="showcase-question">
        <summary>
          <span className="showcase-question-index">03</span>
          {W.idiomQuestion}
          <span className="showcase-plus" aria-hidden>
            ＋
          </span>
        </summary>
        <div className="showcase-answer">
          <p>{W.idiomBody}</p>
          <div>
            <CodeCard
              code={EVIDENCE.gestures}
              language="typescript"
              label={W.idiomQuestion}
              appearance="code"
            />
            <Source path="packages/eslint/src/gestures.ts" />
          </div>
        </div>
      </details>
      <details className="showcase-question">
        <summary>
          <span className="showcase-question-index">04</span>
          {W.mathQuestion}
          <span className="showcase-plus" aria-hidden>
            ＋
          </span>
        </summary>
        <div className="showcase-answer">
          <p>{W.mathBody}</p>
          <div>
            <pre className="showcase-excerpt showcase-math">
              {EVIDENCE.canon}
            </pre>
            <Source path="docs/canon/adaptive-learning-canon.typ" />
          </div>
        </div>
      </details>
    </section>
    <section
      className="showcase-timeline"
      id="over-time"
      aria-labelledby="timeline-title"
    >
      <p className="showcase-kicker">{W.timelineNumber}</p>
      <div className="showcase-section-heading">
        <h2 id="timeline-title">{W.timelineTitle}</h2>
        <p>{W.timelineNote}</p>
      </div>
      <ol>
        {W.timeline.map((entry) => (
          <li key={entry.commit}>
            <time>{entry.date}</time>
            <div>
              <h3>{entry.title}</h3>
              <p>{entry.body}</p>
            </div>
            <a href={`${SOURCE_ROOT}/commit/${entry.commit}`}>
              {entry.commit} →
            </a>
          </li>
        ))}
      </ol>
      <div className="showcase-next">
        <p className="showcase-kicker">{W.next}</p>
        <h3>{W.nextTitle}</h3>
        <p>{W.nextBody}</p>
        <Source path="docs/asks.md" />
        <Source path="docs/monorepo-boundaries.md" />
      </div>
    </section>
    <footer className="showcase-footer">
      <p>{W.footer}</p>
      <div>
        <a href={SOURCE_ROOT}>{W.repo}</a>
        <Link to="/resume">{W.resume}</Link>
        <Link to="/mission">{W.mission}</Link>
      </div>
    </footer>
  </main>
)
