import type { JSX } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  boardLook,
  CALL_CHAPTERS,
  callFormat,
  CallIndexSchema,
  hasCaptions,
  isFirstPage,
  markThemeOf,
  refUrl,
  sampleCallWeek,
} from "@some-ui/video-render"
import type {
  CallGroup,
  CallRef,
  CallScene,
  CallScenePage,
  CallWeek,
} from "@some-ui/video-render"

import { FETCHES_CONTENT } from "@/lib/data-mode"

import { indexSource, weekSource } from "./feed"
import {
  BrandSlide,
  ChapterSlide,
  Field,
  LockedIntro,
  sceneNames,
  StageFrame,
  StageRefused,
} from "./frame"
import type { StageFrameProps } from "./frame"
import { STAGE_WORDS as SW } from "./frame-words"
import type { CallAt, SceneView } from "./view"
import { callAt, stageOf, weekFrom } from "./view"
import { CALL_WORDS as W } from "./words"

/**
 * The weekly call's stage (`@some-ui/video-render`'s `call.ts`): one scene of
 * a week at a time, in the stage's frame (`./frame`), which refuses a
 * scene it can't hold. It plays the week `week` names (its first day), else
 * the newest `paulgsc/testing` keeps (`./feed`), read where the build reads
 * content; elsewhere, or with `week=sample`, the template's sample week.
 */

export type CallStageProps = {
  /** The week shown, by its first day, or "sample". */
  week?: string
  /** The scene shown, by its id; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const NAMES = sceneNames(callFormat())

const SAMPLE = sampleCallWeek()

/** What the frame's header calls the scene: its section, or what frames it. */
const sectionName = (at: { scene: CallScene; view: SceneView }): string => {
  switch (at.scene.section) {
    case "intro": {
      return SW.whoMadeThis
    }
    case "brand-in":
    case "brand-out": {
      return ""
    }
    case "chapter": {
      return at.view.section === "chapter" ? at.view.title : ""
    }
    case "open":
    case "board":
    case "moved":
    case "done":
    case "gray":
    case "mine":
    case "asks":
    case "close": {
      return NAMES[at.scene.section] ?? ""
    }
    default: {
      return assertNever(at.scene)
    }
  }
}

/** What a scene is called: its section's name, and its place among its items. */
const labelOf = (
  scene: CallScene,
  scenes: ReadonlyArray<CallScene>
): string => {
  switch (scene.section) {
    case "intro": {
      return SW.whoMadeThis
    }
    case "brand-in": {
      return SW.brandIn
    }
    case "brand-out": {
      return SW.brandOut
    }
    case "chapter": {
      return W.chapter(CALL_CHAPTERS[scene.of])
    }
    case "open":
    case "board":
    case "moved":
    case "done":
    case "gray":
    case "mine":
    case "asks":
    case "close": {
      const name = NAMES[scene.section] ?? ""
      if (scene.item === undefined)
        return [name, pageLabel(scene)].filter(Boolean).join(", ")
      // Numbered by item; a page after an item's first says which it is.
      const n = scenes
        .filter((s) => s.section === scene.section && isFirstPage(s))
        .findIndex((s) => "item" in s && s.item === scene.item)
      const page = pageLabel(scene)
      return [`${name} ${n + 1}`, page].filter(Boolean).join(", ")
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** "page 2 of 3" for a scene of several pages (CF1), else nothing. */
const pageLabel = (scene: CallScene): string =>
  "page" in scene && scene.page !== undefined && scene.page.of > 1
    ? W.page(scene.page.n, scene.page.of)
    : ""

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

/**
 * A week with no caption band (version 1) lists at most this many of a
 * batch's pull requests, and of the asks left for later, and counts the
 * rest, as it always did. A captioned week pages them instead (CF1).
 */
const V1_PULLS = 10
const V1_LATER = 6

/** A count of what a version 1 list doesn't show, under it. */
const More = ({ n }: { n: number }): JSX.Element | null =>
  n > 0 ? (
    <p className="text-muted-foreground text-[0.85em]">{W.more(n)}</p>
  ) : null

/**
 * Which of a group's `length` entries the scene shows: its page's (CF1),
 * or, in a version 1 week, the first `most`.
 */
const rangeOf = (
  page: CallScenePage | undefined,
  group: CallGroup,
  length: number,
  most: number = length
): readonly [number, number] =>
  page === undefined
    ? [0, Math.min(length, most)]
    : (page.shows[group] ?? [0, 0])

const Screen = ({
  week,
  view,
  page,
}: {
  week: CallWeek
  view: SceneView
  /** The page of its scene it is (CF1); absent in a version 1 week. */
  page: CallScenePage | undefined
}): JSX.Element => {
  const on = (group: CallGroup): boolean => {
    const [from, to] = rangeOf(page, group, 1)
    return to > from
  }
  switch (view.section) {
    case "intro": {
      return (
        <LockedIntro
          heading={`${W.title} · ${week.week.from} – ${week.week.to}`}
          rows={view.rows}
        />
      )
    }
    case "brand-in":
    case "brand-out": {
      return (
        <BrandSlide
          theme={markThemeOf(callFormat(week.template.version).shape)}
          line={view.section === "brand-in" ? W.title : SW.source}
        />
      )
    }
    case "chapter": {
      return (
        <ChapterSlide
          title={view.title}
          holds={view.items > 0 ? W.items(view.items) : undefined}
        />
      )
    }
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
      const look = boardLook(week.board.rows.length)
      const [from, to] = rangeOf(page, "rows", week.board.rows.length)
      return (
        <ul
          className={
            look.columns === 4
              ? "grid grid-cols-4 gap-[0.3em] text-[0.55em]"
              : "grid grid-cols-3 gap-[0.4em] text-[0.7em]"
          }
        >
          {week.board.rows.slice(from, to).map((row) => (
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
      const [from, to] = rangeOf(page, "next", view.item.next.length)
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">
            {view.item.tag} <Ref of={view.item.epic} />
          </p>
          {view.item.landed.length > 0 && on("landed") && (
            <Field label={W.landed}>
              <Refs refs={view.item.landed} />
            </Field>
          )}
          {to > from && (
            <Field label={W.nextUp}>
              <ul className="list-disc pl-[1.2em]">
                {view.item.next.slice(from, to).map((step, i) => (
                  // A step may repeat; its place is its key.
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={from + i}>{step}</li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      )
    }
    case "done": {
      const pulls = view.item.pulls
      const [from, to] = rangeOf(page, "pulls", pulls.length, V1_PULLS)
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          <ul className="space-y-[0.3em] text-[0.85em]">
            {pulls.slice(from, to).map((pull) => (
              <li key={`${pull.repo}-${pull.number}`}>
                <Ref of={pull} /> {pull.title}
                {pull.change !== undefined && (
                  <span className="text-muted-foreground ml-[0.5em] text-[0.8em] uppercase">
                    {W.change[pull.change]}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {page === undefined && <More n={pulls.length - to} />}
        </div>
      )
    }
    case "gray": {
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          {view.item.promise !== undefined && on("promise") && (
            <Field label={W.promise}>
              <p className="font-mono">{view.item.promise}</p>
            </Field>
          )}
          {on("refs") && <Refs refs={view.item.refs} />}
        </div>
      )
    }
    case "mine": {
      const [from, to] = rangeOf(page, "options", view.item.options.length)
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.title}</p>
          {to > from && (
            <Options
              options={view.item.options
                .slice(from, to)
                .map((says) => ({ says }))}
              marked={view.item.chose - from}
              mark={W.chose}
            />
          )}
          {on("why") && <Field label={W.why}>{view.item.why}</Field>}
          {on("undo") && <Field label={W.undo}>{view.item.undo}</Field>}
          {on("refs") && <Refs refs={view.item.refs} />}
        </div>
      )
    }
    case "asks": {
      const [from, to] = rangeOf(page, "options", view.item.options.length)
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{view.item.question}</p>
          {on("why") && <Field label={W.whyYours}>{view.item.whyYours}</Field>}
          {to > from && (
            <Options
              options={view.item.options.slice(from, to)}
              marked={
                view.item.recommended === undefined
                  ? undefined
                  : view.item.recommended - from
              }
              mark={W.recommended}
            />
          )}
          {on("refs") && <Refs refs={view.item.refs} />}
        </div>
      )
    }
    case "close": {
      const [from, to] = rangeOf(page, "later", week.later.length, V1_LATER)
      return (
        <div className="space-y-[0.6em]">
          <p className="text-[1.6em] font-bold">{W.title}</p>
          {to > from && (
            <Field label={W.later}>
              <ul className="space-y-[0.3em] text-[0.85em]">
                {week.later.slice(from, to).map((ask) => (
                  <li key={ask.id}>
                    {ask.question} <Refs refs={ask.refs} />
                  </li>
                ))}
              </ul>
              {page === undefined && <More n={week.later.length - to} />}
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
  week: from,
  scene,
  record = false,
  onScene,
}: CallStageProps): JSX.Element | null => {
  const live = FETCHES_CONTENT && from !== "sample"
  const index = indexSource.useResource(
    ["call", "index"],
    undefined,
    CallIndexSchema,
    { enabled: live, retry: 1 }
  )
  const pick = weekFrom(index.data, from)
  const fetched = weekSource.useResource(
    ["call", "week", pick.from],
    pick.from ?? "",
    undefined,
    { enabled: live && pick.from !== null, retry: 1 }
  )
  const state = stageOf({
    reads: FETCHES_CONTENT,
    record,
    from,
    index: { data: index.data, pending: live && index.isPending },
    week: {
      data: fetched.data,
      pending: live && pick.from !== null && fetched.isPending,
    },
    sample: SAMPLE,
  })
  const shown = state.kind === "show" ? state : null
  const at = shown === null ? null : callAt(shown.week, scene)
  if (state.kind === "waiting" || state.kind === "blank") return null
  if (shown === null || at === null)
    return (
      // VS1 (#2796): what keeps the week off the frame (a template version
      // newer than this stage knows among it) is published where the
      // recorder reads it, so a recording fails instead of waiting.
      <StageRefused
        reason={
          state.kind === "none"
            ? state.problems.join("\n")
            : "the week has no scene to show"
        }
        problems={state.kind === "none" ? state.problems : []}
      />
    )
  return (
    <CallSceneFrame
      week={shown.week}
      at={at}
      record={record}
      sample={shown.sample}
      notes={
        <>
          {shown.unread && (
            <div
              role="status"
              className="text-muted-foreground mx-auto max-w-[1920px] text-sm"
            >
              <p>{W.unread}</p>
              {shown.problems.length > 0 && (
                <ul className="font-mono text-xs">
                  {shown.problems.map((problem, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={i}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {shown.missing && from !== undefined && (
            <p
              role="status"
              className="text-muted-foreground mx-auto max-w-[1920px] text-sm"
            >
              {W.missing(from)}
            </p>
          )}
        </>
      }
      nav={
        onScene === undefined
          ? undefined
          : {
              scenes: at.scenes.map((s) => ({
                id: s.id,
                label: labelOf(s, at.scenes),
              })),
              onScene,
            }
      }
    />
  )
}

/**
 * One scene of `week` in the stage's frame, as recorded with `record`: the
 * stage's, and the ui-fit sweep's (`tests/ui-fit/call-fit.spec.ts`, CF1).
 */
export const CallSceneFrame = ({
  week,
  at,
  record,
  sample = false,
  notes,
  nav,
}: {
  week: CallWeek
  at: CallAt
  record: boolean
  sample?: boolean
  notes?: StageFrameProps["notes"]
  nav?: StageFrameProps["nav"]
}): JSX.Element => {
  const format = callFormat(week.template.version)
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`${week.week.from}/${at.scene.id}`}
      data={{ "data-week": record ? JSON.stringify(week) : undefined }}
      theme={format.shape?.theme}
      title={W.title}
      where={`${[
        sectionName(at),
        pageLabel(at.scene),
        `${at.index + 1}/${at.scenes.length}`,
      ]
        .filter(Boolean)
        .join(" · ")}${sample ? ` · ${W.sample}` : ""}`}
      captioned={record && hasCaptions(format)}
      said={at.scene.said}
      notes={notes}
      nav={nav}
    >
      <Screen
        week={week}
        view={at.view}
        page={"page" in at.scene ? at.scene.page : undefined}
      />
    </StageFrame>
  )
}
