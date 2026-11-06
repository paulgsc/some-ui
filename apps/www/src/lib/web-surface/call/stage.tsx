import type { JSX, ReactNode, RefObject } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import { callFormat, refUrl, sampleCallWeek } from "@some-ui/video-render"
import type { CallRef, CallScene, CallWeek } from "@some-ui/video-render"

import type { SceneView } from "./view"
import { callAt } from "./view"
import { CALL_WORDS as W } from "./words"

/**
 * The weekly call's stage (`@some-ui/video-render`'s `call.ts`): one scene of
 * a week at a time, in a 16:9 frame that scales with the window, the words
 * said under it. The recorder draws it at 1920 CSS px wide with `record`,
 * which leaves out everything that isn't the frame. It plays the template's
 * sample week until the weekly run writes real ones.
 *
 * The frame is fixed, so text that doesn't fit would be cut off unseen: the
 * frame says so instead (`data-overflow`, and a line under it off record),
 * for the recorder to refuse.
 */

export type CallStageProps = {
  /** The scene shown, by its id; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  callFormat().scenes.map((scene) => [scene.id, scene.name])
)

const SAMPLE = sampleCallWeek()

/** The most asks the close lists by name; the rest it counts. */
const LATER_SHOWN = 6

/** What a scene is called: its section's name, and its place among its items. */
const labelOf = (
  scene: CallScene,
  scenes: ReadonlyArray<CallScene>
): string => {
  const name = NAMES[scene.section] ?? scene.section
  if (scene.item === undefined) return name
  const n = scenes.filter((s) => s.section === scene.section).indexOf(scene)
  return `${name} ${n + 1}`
}

/** Whether the element's content runs past its box, as laid out now. */
function useOverflows(key: string): {
  ref: RefObject<HTMLElement | null>
  overflows: boolean
} {
  const ref = useRef<HTMLElement | null>(null)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const box = ref.current
    if (box === null) return undefined
    const measure = (): void => {
      setOverflows(box.scrollHeight > box.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return (): void => {
      observer.disconnect()
    }
  }, [key])
  return { ref, overflows }
}

const Ref = ({ of: r }: { of: CallRef }): JSX.Element => (
  <a
    href={refUrl(r)}
    className="text-muted-foreground hover:text-foreground font-mono underline-offset-4 hover:underline"
  >
    {r.repo}#{r.number}
  </a>
)

const Refs = ({ refs }: { refs: ReadonlyArray<CallRef> }): JSX.Element => (
  <p className="flex flex-wrap gap-x-[1em] text-[0.8em]">
    {refs.map((r, i) => (
      // A ref may repeat; its place is its key.
      // eslint-disable-next-line react/no-array-index-key
      <Ref key={i} of={r} />
    ))}
  </p>
)

const Field = ({
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

const Options = ({
  options,
  marked,
  mark,
}: {
  options: ReadonlyArray<{ says: string; unblocks?: string }>
  marked: number | undefined
  mark: string
}): JSX.Element => (
  <ol className="space-y-[0.4em]">
    {options.map((option, i) => (
      <li
        key={option.says}
        className={
          i === marked
            ? "border-primary rounded-[0.3em] border-2 px-[0.6em] py-[0.3em]"
            : "border-border rounded-[0.3em] border px-[0.6em] py-[0.3em]"
        }
      >
        <p>
          {option.says}
          {i === marked && (
            <span className="text-primary ml-[0.6em] text-[0.7em] uppercase">
              {mark}
            </span>
          )}
        </p>
        {option.unblocks !== undefined && (
          <p className="text-muted-foreground text-[0.75em]">
            {W.unblocks}: {option.unblocks}
          </p>
        )}
      </li>
    ))}
  </ol>
)

const Screen = ({
  week,
  view,
}: {
  week: CallWeek
  view: SceneView
}): JSX.Element => {
  switch (view.section) {
    case "open": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[2.4em] font-bold">
            {week.week.from} – {week.week.to}
          </p>
          <p className="text-muted-foreground font-mono text-[0.8em]">
            {W.read}: some-ui {week.read["some-ui"].slice(0, 7)} · server{" "}
            {week.read.server.slice(0, 7)}
          </p>
        </div>
      )
    }
    case "board": {
      return (
        <ul className="grid grid-cols-3 gap-[0.4em] text-[0.7em]">
          {week.board.rows.map((row) => (
            <li
              key={row.ledger}
              className="border-border rounded-[0.3em] border px-[0.6em] py-[0.4em]"
            >
              <p className="font-semibold">{row.title}</p>
              <p className="text-muted-foreground text-[0.85em]">
                {row.waitsOnYou > 0
                  ? W.waiting(row.waitsOnYou)
                  : W.status[row.status]}
              </p>
            </li>
          ))}
        </ul>
      )
    }
    case "moved": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">
            {view.item.tag} <Ref of={view.item.epic} />
          </p>
          {view.item.landed.length > 0 && (
            <Field label={W.landed}>
              <Refs refs={view.item.landed} />
            </Field>
          )}
          {view.item.next.length > 0 && (
            <Field label={W.nextUp}>
              <ul className="list-disc pl-[1.2em]">
                {view.item.next.map((step, i) => (
                  // A step may repeat; its place is its key.
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      )
    }
    case "done": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          <ul className="space-y-[0.3em] text-[0.85em]">
            {view.item.pulls.map((pull) => (
              <li key={`${pull.repo}-${pull.number}`}>
                <Ref of={pull} /> {pull.title}{" "}
                <span className="text-muted-foreground text-[0.8em] uppercase">
                  {W.change[pull.change]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    }
    case "gray": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          {view.item.promise !== undefined && (
            <Field label={W.promise}>
              <p className="font-mono">{view.item.promise}</p>
            </Field>
          )}
          <Refs refs={view.item.refs} />
        </div>
      )
    }
    case "mine": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          <Options
            options={view.item.options.map((says) => ({ says }))}
            marked={view.item.chose}
            mark={W.chose}
          />
          <Field label={W.why}>{view.item.why}</Field>
          <Field label={W.undo}>{view.item.undo}</Field>
          <Refs refs={view.item.refs} />
        </div>
      )
    }
    case "asks": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.question}</p>
          <Field label={W.whyYours}>{view.item.whyYours}</Field>
          <Options
            options={view.item.options}
            marked={view.item.recommended}
            mark={W.recommended}
          />
          <Refs refs={view.item.refs} />
        </div>
      )
    }
    case "close": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{W.title}</p>
          {week.later.length > 0 && (
            <Field label={W.later}>
              <ul className="space-y-[0.3em] text-[0.85em]">
                {week.later.slice(0, LATER_SHOWN).map((ask) => (
                  <li key={ask.id}>
                    {ask.question} <Refs refs={ask.refs} />
                  </li>
                ))}
              </ul>
              {week.later.length > LATER_SHOWN && (
                <p className="text-muted-foreground text-[0.85em]">
                  {W.more(week.later.length - LATER_SHOWN)}
                </p>
              )}
            </Field>
          )}
        </div>
      )
    }
    default: {
      return assertNever(view)
    }
  }
}

export const CallStagePage = ({
  scene,
  record = false,
  onScene,
}: CallStageProps): JSX.Element => {
  const at = SAMPLE.ok ? callAt(SAMPLE.value, scene) : null
  const { ref, overflows } = useOverflows(at?.scene.id ?? "")
  if (!SAMPLE.ok || at === null)
    return (
      <ul className="p-6 font-mono text-sm">
        {SAMPLE.ok
          ? null
          : SAMPLE.problems.map((problem, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i}>{problem}</li>
            ))}
      </ul>
    )
  const week = SAMPLE.value
  const step = (by: number): string | undefined => at.scenes[at.index + by]?.id
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
          data-scene={at.scene.id}
          data-overflow={overflows ? "true" : undefined}
          className="bg-surface border-border flex aspect-video w-full flex-col overflow-hidden border text-[1.5cqw]"
        >
          <header className="border-border flex items-center justify-between border-b px-[1.2em] py-[0.6em] text-[0.8em]">
            <span className="font-semibold">{W.title}</span>
            <span className="text-muted-foreground">
              {NAMES[at.scene.section]} · {at.index + 1}/{at.scenes.length} ·{" "}
              {W.sample}
            </span>
          </header>
          <div className="min-h-0 flex-1 px-[1.6em] py-[1.2em]">
            <Screen week={week} view={at.view} />
          </div>
          <footer className="bg-background/80 border-border border-t px-[1.6em] py-[0.8em] text-[1.05em] leading-snug">
            {at.scene.said}
          </footer>
        </section>
      </div>
      {!record && overflows && (
        <p
          role="status"
          className="text-destructive mx-auto max-w-[1920px] text-sm"
        >
          {W.overflows}
        </p>
      )}
      {!record && onScene !== undefined && (
        <nav
          aria-label={W.scenes}
          className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-2 text-sm"
        >
          <button
            type="button"
            disabled={previous === undefined}
            onClick={() => {
              if (previous !== undefined) onScene(previous)
            }}
            className="border-border rounded border px-3 py-1 disabled:opacity-40"
          >
            {W.previous}
          </button>
          <button
            type="button"
            disabled={next === undefined}
            onClick={() => {
              if (next !== undefined) onScene(next)
            }}
            className="border-border rounded border px-3 py-1 disabled:opacity-40"
          >
            {W.next}
          </button>
          {at.scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={s.id === at.scene.id ? "step" : undefined}
              onClick={() => onScene(s.id)}
              className={
                s.id === at.scene.id
                  ? "bg-primary text-primary-foreground rounded px-2 py-1 text-xs"
                  : "text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs"
              }
            >
              {labelOf(s, at.scenes)}
            </button>
          ))}
        </nav>
      )}
    </main>
  )
}
