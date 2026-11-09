import type { JSX, ReactNode } from "react"
import { captionSpace, LANDSCAPE } from "@some-ui/burn-ins"
import { useOverflows } from "@some-ui/react-hooks"
import { BrandMark } from "@some-ui/shared"
import type { SessionThemeId } from "@some-ui/styles/theme"
import { sessionThemeProps } from "@some-ui/styles/theme"

import { STAGE_WORDS as W } from "./frame-words"

/**
 * A recording stage's frame, which every template's stage draws its scenes
 * in (the weekly call's, `./stage`; the Rust Rounds essay's,
 * `./essay-stage`): one scene at a time, in a 16:9 frame that scales with
 * the window, the words said under it. The recorder draws it at 1920 CSS px
 * wide with `record`, which leaves out everything that isn't the frame.
 *
 * The frame is fixed, so text that doesn't fit would be cut off unseen: the
 * frame says so instead (`data-overflow`, and a line under it off record),
 * for the recorder to refuse. With captions on record, the footer is the
 * band they're drawn in, left empty: the renderer lays each scene's there.
 */

export type StageFrameProps = {
  record: boolean
  /** The scene shown, by its id. */
  scene: string
  /** What the overflow is measured again for: the data and the scene. */
  measureKey: string
  /** The frame's own `data-*` attributes, such as the data on record. */
  data?: Readonly<Record<`data-${string}`, string | undefined>>
  theme: SessionThemeId | undefined
  /** The header's left: the template's title. */
  title: string
  /** The header's right: where the scene is. */
  where: string
  /** Whether the footer is the captions' band, on record. */
  captioned: boolean
  /** The words said over the scene, under the frame off record. */
  said: string
  /** The scene's picture. */
  children: ReactNode
  /** Lines under the frame, off record, before the overflow line. */
  notes?: ReactNode
  /** The scene buttons, off record. */
  nav?: {
    readonly scenes: ReadonlyArray<{
      readonly id: string
      readonly label: string
    }>
    readonly onScene: (scene: string) => void
  }
}

export const StageFrame = ({
  record,
  scene,
  measureKey,
  data,
  theme,
  title,
  where,
  captioned,
  said,
  children,
  notes,
  nav,
}: StageFrameProps): JSX.Element => {
  // The frame's header, body and footer are each clipped on their own.
  const { ref, overflows } = useOverflows(measureKey, { regions: true })
  const index = nav?.scenes.findIndex((s) => s.id === scene) ?? -1
  const step = (by: number): string | undefined => nav?.scenes[index + by]?.id
  const previous = step(-1)
  const next = step(1)
  return (
    <main
      className={
        record
          ? "bg-background text-foreground"
          : "bg-background text-foreground min-h-svh space-y-4 p-6"
      }
    >
      <div className="mx-auto w-full max-w-[1920px] [container-type:inline-size]">
        <section
          ref={ref}
          data-scene={scene}
          data-overflow={overflows ? "true" : undefined}
          {...data}
          {...sessionThemeProps(theme, {
            className:
              "bg-surface text-foreground border-border flex aspect-video w-full flex-col overflow-hidden border text-[1.5cqw] [overflow-wrap:anywhere]",
          })}
        >
          <header className="border-border flex items-center justify-between border-b px-[1.2em] py-[0.6em] text-[0.8em]">
            <span className="font-semibold">{title}</span>
            <span className="text-muted-foreground">{where}</span>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden px-[1.6em] py-[1.2em]">
            {children}
          </div>
          {captioned ? (
            <footer
              data-caption-band=""
              className="border-border shrink-0 border-t"
              // In the frame's width, the container's unit.
              style={{
                height: `${(100 * captionSpace(LANDSCAPE)) / LANDSCAPE.width}cqw`,
              }}
            />
          ) : (
            <footer className="bg-background/80 border-border border-t px-[1.6em] py-[0.8em] text-[1.05em] leading-snug">
              {said}
            </footer>
          )}
        </section>
      </div>
      {!record && notes}
      {!record && overflows && (
        <p
          role="status"
          className="text-destructive mx-auto max-w-[1920px] text-sm"
        >
          {W.overflows}
        </p>
      )}
      {!record && nav !== undefined && (
        <nav
          aria-label={W.scenes}
          className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-2 text-sm"
        >
          <button
            type="button"
            disabled={previous === undefined}
            onClick={() => {
              if (previous !== undefined) nav.onScene(previous)
            }}
            className="border-border rounded border px-3 py-1 disabled:opacity-40"
          >
            {W.previous}
          </button>
          <button
            type="button"
            disabled={next === undefined}
            onClick={() => {
              if (next !== undefined) nav.onScene(next)
            }}
            className="border-border rounded border px-3 py-1 disabled:opacity-40"
          >
            {W.next}
          </button>
          {nav.scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={s.id === scene ? "step" : undefined}
              onClick={() => nav.onScene(s.id)}
              className={
                s.id === scene
                  ? "bg-primary text-primary-foreground rounded px-2 py-1 text-xs"
                  : "text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs"
              }
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}
    </main>
  )
}

/**
 * What a stage shows instead of a frame when nothing can be drawn: the
 * reasons, published where the recorder reads them (`data-refused`), so a
 * recording fails instead of waiting (VS1, #2796).
 */
export const StageRefused = ({
  reason,
  problems,
}: {
  reason: string
  problems: ReadonlyArray<string>
}): JSX.Element => (
  <ul data-refused={reason} className="p-6 font-mono text-sm">
    {problems.map((problem, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <li key={i}>{problem}</li>
    ))}
  </ul>
)

/** The locked intro (SFEED2): a heading, then who made the video, row by row. */
export const LockedIntro = ({
  heading,
  rows,
}: {
  heading: string
  rows: ReadonlyArray<{ readonly label: string; readonly says: string }>
}): JSX.Element => (
  <div className="flex h-full flex-col justify-center space-y-[1em]">
    <p className="text-primary text-[0.8em] tracking-wide uppercase">
      {heading}
    </p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-[1.2em] gap-y-[0.6em] text-[1.2em]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-primary font-semibold">{row.label}</dt>
          <dd>{row.says}</dd>
        </div>
      ))}
    </dl>
  </div>
)

/** The brand intro or outro, as the stage draws it: the owner's mark, and a line. */
export const BrandSlide = ({
  theme,
  line,
}: {
  /** The theme the mark is drawn in (`markThemeOf`). */
  theme: SessionThemeId | undefined
  line: string
}): JSX.Element => (
  <div className="flex h-full flex-col items-center justify-center gap-[0.8em]">
    <BrandMark
      tone="brand"
      className="size-[12em]"
      title={W.mark}
      theme={theme}
    />
    <p className="text-[1.6em] font-bold">{line}</p>
  </div>
)

/** A chapter slide: its title, said aloud, and what it holds. */
export const ChapterSlide = ({
  title,
  holds,
}: {
  title: string
  holds?: string
}): JSX.Element => (
  <div className="flex h-full flex-col justify-center space-y-[0.4em]">
    <p className="text-[3.2em] font-bold">{title}</p>
    {holds !== undefined && (
      <p className="text-muted-foreground text-[1.2em]">{holds}</p>
    )}
  </div>
)

/** A labelled field of a scene's picture. */
export const Field = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): JSX.Element => (
  <div className="space-y-[0.2em]">
    <p className="text-muted-foreground text-[0.7em] tracking-wide uppercase">
      {label}
    </p>
    <div>{children}</div>
  </div>
)
