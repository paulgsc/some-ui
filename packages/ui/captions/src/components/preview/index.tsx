import { useMemo, useState, type JSX } from "react"
import { CaptionStage } from "@captions/components/stage"
import { useCaptionClock } from "@captions/hooks/use-caption-clock"
import { frameAt } from "@captions/lib/frame"
import { SAMPLE } from "@captions/lib/sample"
import { toSrt } from "@captions/lib/srt"
import {
  DEFAULT_THEME,
  isThemeId,
  THEME_IDS,
  THEMES,
  type ThemeId,
} from "@captions/lib/theme"
import { captionsFor, runtimeOf } from "@captions/lib/timing"
import { WORDS } from "@captions/lib/words"

const BUTTON =
  "border-border rounded-md border px-3 py-1.5 text-sm transition-colors"

/**
 * Where the owner tunes the subtitles' look on sample lines: pick a look,
 * play or drag through the sample, and see the short as the renderer will
 * record it, with the plain subtitle file that goes up beside it.
 * `initialTheme` and `initialAtMs` are read once, where the page opens; an
 * unknown look opens on the default.
 */
export const CaptionsPreview = ({
  initialTheme,
  initialAtMs = 0,
}: {
  initialTheme?: string
  initialAtMs?: number
}): JSX.Element => {
  const [themeId, setThemeId] = useState<ThemeId>(() =>
    isThemeId(initialTheme) ? initialTheme : DEFAULT_THEME
  )
  const [outline, setOutline] = useState(true)
  const theme = THEMES[themeId]
  const captions = useMemo(() => captionsFor(SAMPLE, theme), [theme])
  const totalMs = runtimeOf(captions)
  const clock = useCaptionClock(initialAtMs)
  const atMs = Math.min(clock.atMs, totalMs)
  const frame = frameAt(captions, theme, atMs)
  const srt = useMemo(() => toSrt(captions), [captions])

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{WORDS.title}</h1>
            <p className="text-muted-foreground">{WORDS.intro}</p>
            <p className="text-muted-foreground text-sm">{WORDS.sample}</p>
          </header>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{WORDS.lookHeading}</h2>
            <div className="flex flex-wrap gap-2">
              {THEME_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === themeId}
                  className={`${BUTTON} ${id === themeId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => setThemeId(id)}
                >
                  {WORDS.looks[id].name}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              {WORDS.looks[themeId].about}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`${BUTTON} hover:bg-muted min-w-20`}
                onClick={() =>
                  clock.playing ? clock.pause() : clock.play(totalMs)
                }
              >
                {clock.playing ? WORDS.pause : WORDS.play}
              </button>
              <span className="text-muted-foreground font-mono text-sm tabular-nums">
                {WORDS.time(atMs, totalMs)}
              </span>
            </div>
            <input
              type="range"
              aria-label={WORDS.timeLabel}
              min={0}
              max={totalMs}
              step={10}
              value={atMs}
              onChange={(e) => clock.seek(Number(e.target.value), totalMs)}
              className="accent-primary w-full"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={outline}
                onChange={(e) => setOutline(e.target.checked)}
              />
              {WORDS.outline}
            </label>
            <p className="text-muted-foreground text-sm">{WORDS.outlineNote}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{WORDS.fileHeading}</h2>
            <p className="text-muted-foreground text-sm">{WORDS.fileNote}</p>
            <pre className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
              {srt}
            </pre>
          </section>
        </div>

        <div className="md:sticky md:top-8 md:self-start">
          <CaptionStage
            frame={frame}
            theme={theme}
            outline={outline}
            label={WORDS.stageLabel}
          />
        </div>
      </div>
    </div>
  )
}
