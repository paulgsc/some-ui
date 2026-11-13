/**
 * A template's shape, as Studio's Templates page shows it (SFEED1, #2731):
 * its storyboard (SFEED3, #2744), every frame of one episode of its sample,
 * from the locked intro to the brand outro, and its captions. The frames are
 * `@some-ui/video-render`'s `templateStoryboard`, made by the same code that
 * makes an episode. Code's words show
 * in full; what the AI writes is grey bars, as long as the frame holds.
 */
import type { JSX } from "react"
import type {
  Format,
  FrameKind,
  Storyboard,
  StoryFrame,
} from "@some-ui/video-render"
import { framesInTime } from "@some-ui/video-render"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.templates

/** About one bar a line of words, a line for every five seconds held. */
const BAR_MS = 5_000
/** The bars' widths, in turn, so they read as lines of text. */
const BARS = [
  { id: "a", width: "w-full" },
  { id: "b", width: "w-11/12" },
  { id: "c", width: "w-4/5" },
  { id: "d", width: "w-full" },
  { id: "e", width: "w-2/3" },
  { id: "f", width: "w-5/6" },
] as const

/** Where the AI's words go: grey bars, read aloud as what they stand for. */
const Bars = ({ ms }: { ms: number }): JSX.Element => {
  const n = Math.min(BARS.length, Math.max(1, Math.round(ms / BAR_MS)))
  return (
    <span
      role="img"
      aria-label={WORDS.aiWrites}
      className="flex flex-col gap-1"
    >
      {BARS.slice(0, n).map(({ id, width }) => (
        <span
          key={id}
          aria-hidden
          className={`bg-muted-foreground/30 h-2 rounded-full ${width}`}
        />
      ))}
    </span>
  )
}

/** What a frame is called on the board. */
const FRAME_NAME: Readonly<Record<FrameKind, (frame: StoryFrame) => string>> = {
  intro: () => WORDS.who,
  "brand-in": () => WORDS.brandIn,
  "brand-out": () => WORDS.brandOut,
  chapter: (frame) => WORDS.chapter(frame.name),
  section: (frame) =>
    frame.item === undefined ? frame.name : WORDS.item(frame.name, frame.item),
}

/** What a section's frame adds: its point, how often it repeats, or that it may not show. */
function sectionLine(scene: Format["scenes"][number] | undefined): string {
  if (scene === undefined) return ""
  return [
    scene.point,
    ...(scene.repeat === undefined ? [] : [WORDS.upTo(scene.repeat.max)]),
    ...(scene.skip === undefined ? [] : [WORDS.sometimes]),
  ].join(". ")
}

/** What a frame says or shows under its name. */
const FRAME_LINE: Readonly<
  Record<FrameKind, (frame: StoryFrame, format: Format) => string>
> = {
  intro: () => WORDS.whoLine,
  "brand-in": () => WORDS.brandLine,
  "brand-out": () => WORDS.brandLine,
  chapter: () => "",
  // A section shown once per item says its point over its first.
  section: (frame, format) =>
    frame.item === undefined || frame.item === 1
      ? sectionLine(format.scenes.find((s) => s.id === frame.scene))
      : "",
}

const Frame = ({
  frame,
  format,
  atMs,
}: {
  frame: StoryFrame
  format: Format
  atMs: number
}): JSX.Element => {
  const line = FRAME_LINE[frame.kind](frame, format)
  return (
    <li
      className={
        frame.kind === "intro"
          ? "bg-brand/10 border-brand/40 flex flex-col gap-1 rounded-xl border px-3 py-2"
          : frame.kind === "chapter"
            ? "ml-4 flex flex-col gap-1 rounded-xl border border-dashed px-3 py-1"
            : "border-border/60 flex flex-col gap-1 rounded-xl border px-3 py-2"
      }
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">
          {FRAME_NAME[frame.kind](frame)}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {WORDS.when(atMs, frame.ms)}
        </span>
      </span>
      {line !== "" && (
        <span className="text-muted-foreground text-xs">{line}</span>
      )}
      {frame.by === "code" && <span className="text-sm">{frame.said}</span>}
      {frame.by === "fill" && <Bars ms={frame.ms} />}
      {frame.by === "none" && (
        <span className="text-muted-foreground text-xs italic">
          {WORDS.nothingSaid}
        </span>
      )}
    </li>
  )
}

export const TemplateShape = ({
  format,
  board,
}: {
  format: Format
  board: Storyboard
}): JSX.Element => {
  const { shape } = format
  const time = framesInTime(board)
  return (
    <>
      <Part label={WORDS.frames}>
        <p className="text-muted-foreground text-sm">
          {WORDS.drawnFrom(board.sample)}
        </p>
        <p className="text-sm font-semibold">{WORDS.inAll(time.ms)}</p>
        <ol className="flex flex-col gap-2">
          {board.frames.map((frame, i) => (
            <Frame
              key={frame.id}
              frame={frame}
              format={format}
              atMs={time.at[i] ?? 0}
            />
          ))}
        </ol>
      </Part>
      <Part label={WORDS.captions}>
        {shape === undefined ? (
          <p className="text-muted-foreground text-sm">{WORDS.noShape}</p>
        ) : (
          <>
            <p className="text-sm">{WORDS.captioned[shape.subtitles]}</p>
            <p className="text-muted-foreground text-sm">
              {WORDS.chapters(shape.chapters.length)}
            </p>
          </>
        )}
      </Part>
    </>
  )
}
