import { useMemo, useState, type JSX } from "react"
import { BurnInStage } from "@burn-ins/components/stage"
import { usePreviewClock } from "@burn-ins/hooks/use-preview-clock"
import {
  DESIGNS,
  frameAt,
  isKind,
  KINDS,
  prepare,
  runtimeMs,
  type Kind,
  type Prepared,
} from "@burn-ins/lib/burn-in"
import { toSrt } from "@burn-ins/lib/captions/srt"
import { SAMPLES, STILL_SAMPLE_MS } from "@burn-ins/lib/samples"
import { WORDS } from "@burn-ins/lib/words"

const designsOf = (kind: Kind): ReadonlyArray<string> => DESIGNS[kind]

/** The design to open on: the one asked for, if the kind has it. */
const designFor = (kind: Kind, asked: string | undefined): string =>
  designsOf(kind).find((d) => d === asked) ?? designsOf(kind)[0] ?? ""

/** A kind's sample in a design. The samples are checked in tests, so a refusal here is a bug. */
const sampleOf = (kind: Kind, design: string): Prepared => {
  const prepared = prepare({ kind, design, params: SAMPLES[kind] })
  if (!prepared.ok) throw new Error(prepared.problems.join("; "))
  return prepared.value
}

const BUTTON =
  "border-border rounded-md border px-3 py-1.5 text-sm transition-colors"

/**
 * Where the owner tunes what is drawn into every video, on sample data: pick
 * a kind and a look, play or drag through the sample, and see the video as
 * the recorder will draw it, with, for subtitles, the plain file that goes
 * up beside it. `initialKind`, `initialDesign` and `initialAtMs` are read
 * once, where the page opens; an unknown kind or look opens on the default.
 */
export const BurnInsPreview = ({
  initialKind,
  initialDesign,
  initialAtMs = 0,
}: {
  initialKind?: string
  initialDesign?: string
  initialAtMs?: number
}): JSX.Element => {
  const [kind, setKind] = useState<Kind>(() =>
    isKind(initialKind) ? initialKind : "captions"
  )
  const [design, setDesign] = useState(() => designFor(kind, initialDesign))
  const [outline, setOutline] = useState(true)
  const prepared = useMemo(() => sampleOf(kind, design), [kind, design])
  const totalMs = runtimeMs(prepared) ?? STILL_SAMPLE_MS
  const clock = usePreviewClock(initialAtMs)
  const atMs = Math.min(clock.atMs, totalMs)
  const frame = frameAt(prepared, atMs)
  const srt = useMemo(
    () => (prepared.kind === "captions" ? toSrt(prepared.captions) : null),
    [prepared]
  )
  const pick = (next: Kind): void => {
    setKind(next)
    setDesign(designFor(next, undefined))
  }

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{WORDS.title}</h1>
            <p className="text-muted-foreground">{WORDS.intro}</p>
          </header>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{WORDS.kindHeading}</h2>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === kind}
                  className={`${BUTTON} ${id === kind ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => pick(id)}
                >
                  {WORDS.kinds[id].name}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              {WORDS.kinds[kind].about}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">{WORDS.lookHeading}</h2>
            <div className="flex flex-wrap gap-2">
              {DESIGNS[kind].map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === design}
                  className={`${BUTTON} ${id === design ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  onClick={() => setDesign(id)}
                >
                  {WORDS.looks[id].name}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              {WORDS.looks[prepared.design].about}
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

          {srt === null ? null : (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">{WORDS.fileHeading}</h2>
              <p className="text-muted-foreground text-sm">{WORDS.fileNote}</p>
              <pre className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {srt}
              </pre>
            </section>
          )}
        </div>

        <div className="md:sticky md:top-8 md:self-start">
          <BurnInStage
            frames={[frame]}
            outline={outline}
            label={WORDS.stageLabel}
          />
        </div>
      </div>
    </div>
  )
}
