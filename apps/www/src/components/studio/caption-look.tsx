/**
 * A template's caption look, set on its page in Studio (SFEED11, #2707):
 * each part the control can change, a preview of a caption line in the look
 * as it is set, and the way to send it, a new GitHub issue holding the look
 * for a session to land (`lib/caption-look`, `./send-issue`). The preview is a still of one
 * line in the template's frame, drawn here from the look's values at the
 * video's scale, since the phone's build doesn't carry `@some-ui/burn-ins`'
 * recorder; a word's pop-in shows only on video.
 */
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

import type { CSSProperties, JSX, ReactNode } from "react"
import { useId, useState } from "react"
import type { CaptionTheme, ThemeId } from "@some-ui/burn-ins/contract"

import type { LookEdit } from "@/lib/caption-look"
import {
  editOf,
  FIRST_PLATE,
  LOOK_RANGES,
  lookIssueUrl,
  sameLook,
  withEdit,
} from "@/lib/caption-look"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"
import { SendIssue } from "./send-issue"

const WORDS = STUDIO_INDEX_WORDS.templates.look

/** The word the preview shows being said. */
const SAID = 3

type Frame = { readonly width: number; readonly height: number }

const rgba = (hex: string, opacity: number): string => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)}, ${String(opacity)})`
}

/**
 * A look's length on the preview: a look's lengths are in a frame whose
 * shorter side is 1080 px (`sizedFor`), here as a share of the preview's width.
 */
const unitsIn =
  (frame: Frame) =>
  (px: number): string =>
    `${String(((px / 1080) * Math.min(frame.width, frame.height) * 100) / frame.width)}cqw`

const Preview = ({
  look,
  frame,
}: {
  look: CaptionTheme
  frame: Frame
}): JSX.Element => {
  const { font, colours, plate } = look
  const u = unitsIn(frame)
  const line: CSSProperties = {
    // One block that wraps inside the frame's safe width, as the video's
    // captions do, so a plate stays one piece.
    display: "inline-block",
    maxWidth: "80%",
    textAlign: "center",
    fontFamily: font.family,
    fontWeight: font.weight,
    fontSize: u(font.sizePx),
    lineHeight: font.lineHeight,
    letterSpacing: `${String(font.letterSpacingEm)}em`,
    textTransform: font.uppercase ? "uppercase" : "none",
    color: colours.text,
    WebkitTextStroke:
      look.strokePx > 0 ? `${u(look.strokePx)} ${colours.stroke}` : undefined,
    paintOrder: "stroke fill",
    ...(plate === null
      ? {}
      : {
          background: rgba(plate.colour, plate.opacity),
          borderRadius: u(plate.radiusPx),
          padding: `${u(plate.padYPx)} ${u(plate.padXPx)}`,
        }),
  }
  return (
    <div
      aria-hidden
      style={{
        aspectRatio: `${String(frame.width)} / ${String(frame.height)}`,
        containerType: "inline-size",
      }}
      className={`flex items-end justify-center overflow-hidden rounded-xl bg-[linear-gradient(160deg,#3a4a3f,#151a22)] pb-[8%] ${frame.height > frame.width ? "mx-auto w-1/2" : "w-full"}`}
    >
      <span style={line}>
        {WORDS.sample.map((word, i) => (
          <span
            key={word}
            style={
              look.effects.highlight && i === SAID
                ? { color: colours.highlight }
                : undefined
            }
          >
            {i > 0 ? " " : ""}
            {word}
          </span>
        ))}
      </span>
    </div>
  )
}

const Field = ({
  label,
  children,
}: {
  label: string
  children: (id: string) => ReactNode
}): JSX.Element => {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

const Colour = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): JSX.Element => (
  <Field label={label}>
    {(id) => (
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="border-border h-9 w-14 rounded-md border"
      />
    )}
  </Field>
)

const Range = ({
  label,
  value,
  range,
  said,
  onChange,
}: {
  label: string
  value: number
  range: { readonly min: number; readonly max: number; readonly step: number }
  said: string
  onChange: (value: number) => void
}): JSX.Element => (
  <Field label={label}>
    {(id) => (
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="w-32"
        />
        <span className="text-muted-foreground w-24 text-right text-xs">
          {said}
        </span>
      </span>
    )}
  </Field>
)

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): JSX.Element => (
  <Field label={label}>
    {(id) => (
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-5"
      />
    )}
  </Field>
)

/** The control, over the look template `template` names (`from`). */
export const CaptionLook = ({
  template,
  from,
  look,
  frame,
}: {
  template: { readonly id: string; readonly title: string }
  from: ThemeId
  look: CaptionTheme
  frame: Frame
}): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- an edit buffer over the look it edits; the page keys it by template */
  const [edit, setEdit] = useState<LookEdit>(() => editOf(look))
  /* eslint-enable owner-guard/no-mount-snapshot */
  const set = (change: (now: LookEdit) => Partial<LookEdit>): void =>
    setEdit((now) => ({ ...now, ...change(now) }))
  const plate = (change: Partial<NonNullable<LookEdit["plate"]>>): void =>
    set((now) => ({
      plate: now.plate === null ? null : { ...now.plate, ...change },
    }))
  const shown = withEdit(look, edit)
  const changed = !sameLook(shown, look)
  return (
    <Part label={WORDS.label}>
      <p className="text-sm">{WORDS.named(from)}</p>
      <p className="text-muted-foreground text-sm">{WORDS.line}</p>
      <Preview look={shown} frame={frame} />
      <div className="flex flex-col gap-2">
        <Field label={WORDS.weight}>
          {(id) => (
            <select
              id={id}
              value={edit.weight}
              onChange={(event) => {
                // Read now: React clears the event before an updater runs.
                const weight = event.currentTarget.value === "800" ? 800 : 600
                set(() => ({ weight }))
              }}
              className="border-border bg-background rounded-md border px-2 py-1 text-sm"
            >
              <option value="600">{WORDS.bold}</option>
              <option value="800">{WORDS.heavy}</option>
            </select>
          )}
        </Field>
        <Range
          label={WORDS.size}
          value={edit.sizePx}
          range={LOOK_RANGES.sizePx}
          said={String(edit.sizePx)}
          onChange={(sizePx) => set(() => ({ sizePx }))}
        />
        <Colour
          label={WORDS.text}
          value={edit.text}
          onChange={(text) => set(() => ({ text }))}
        />
        <Toggle
          label={WORDS.litOn}
          checked={edit.lit}
          onChange={(lit) => set(() => ({ lit }))}
        />
        {edit.lit && (
          <Colour
            label={WORDS.lit}
            value={edit.highlight}
            onChange={(highlight) => set(() => ({ highlight }))}
          />
        )}
        <Colour
          label={WORDS.stroke}
          value={edit.stroke}
          onChange={(stroke) => set(() => ({ stroke }))}
        />
        <Range
          label={WORDS.strokeWidth}
          value={edit.strokePx}
          range={LOOK_RANGES.strokePx}
          said={String(edit.strokePx)}
          onChange={(strokePx) => set(() => ({ strokePx }))}
        />
        <Toggle
          label={WORDS.plate}
          checked={edit.plate !== null}
          onChange={(on) =>
            set(() => ({
              plate: on
                ? (editOf(look).plate ??
                  (FIRST_PLATE === undefined
                    ? null
                    : {
                        colour: FIRST_PLATE.colour,
                        opacity: FIRST_PLATE.opacity,
                      }))
                : null,
            }))
          }
        />
        {edit.plate !== null && (
          <>
            <Colour
              label={WORDS.plateColour}
              value={edit.plate.colour}
              onChange={(colour) => plate({ colour })}
            />
            <Range
              label={WORDS.plateOpacity}
              value={edit.plate.opacity}
              range={LOOK_RANGES.opacity}
              said={`${String(Math.round(edit.plate.opacity * 100))}%`}
              onChange={(opacity) => plate({ opacity })}
            />
          </>
        )}
        <Range
          label={WORDS.popIn}
          value={edit.popInMs}
          range={LOOK_RANGES.popInMs}
          said={WORDS.popInMs(edit.popInMs)}
          onChange={(popInMs) => set(() => ({ popInMs }))}
        />
      </div>
      <SendIssue
        href={changed ? lookIssueUrl(template, from, shown) : null}
        sendLine={WORDS.sendLine}
        onReset={() => setEdit(editOf(look))}
      />
    </Part>
  )
}
