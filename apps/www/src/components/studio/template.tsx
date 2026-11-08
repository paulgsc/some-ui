/**
 * A template's shape, as Studio's Templates page shows it (SFEED1, #2731;
 * ST30's scene rows): the locked intro, the brand intro, each section in
 * order with the chapter slides said aloud before the ones marked, the brand
 * outro, and its captions. All of it is read from the template's newest
 * pinned format (`@some-ui/video-render`'s `templateFormat`), so what this
 * shows is what home makes. Setting it from here is a later story (SFEED2,
 * SFEED3).
 */
import type { JSX } from "react"
import type { Format } from "@some-ui/video-render"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.templates

/** One row of the shape: what it is, and a line under it. */
const Row = ({
  name,
  line,
  locked = false,
}: {
  name: string
  line: string
  locked?: boolean
}): JSX.Element => (
  <li
    className={
      locked
        ? "bg-brand/10 border-brand/40 flex flex-col rounded-xl border px-3 py-2"
        : "border-border/60 flex flex-col rounded-xl border px-3 py-2"
    }
  >
    <span className="text-sm font-semibold">{name}</span>
    <span className="text-muted-foreground text-xs">{line}</span>
  </li>
)

/** The chapter slide said aloud before a marked section. */
const Chapter = (): JSX.Element => (
  <li className="text-muted-foreground ml-4 rounded-xl border border-dashed px-3 py-1 text-xs">
    <span aria-hidden>◆ </span>
    {WORDS.chapter}
  </li>
)

/** What a section's line adds: how often it can repeat, or that it may not show. */
function sectionLine(scene: Format["scenes"][number]): string {
  const more = [
    ...(scene.repeat === undefined ? [] : [WORDS.upTo(scene.repeat.max)]),
    ...(scene.skip === undefined ? [] : [WORDS.sometimes]),
  ]
  return [scene.point, ...more].join(". ")
}

export const TemplateShape = ({ format }: { format: Format }): JSX.Element => {
  const { shape } = format
  if (shape === undefined) {
    return <p className="text-muted-foreground text-sm">{WORDS.noShape}</p>
  }
  const marked = new Set(shape.chapters)
  return (
    <>
      <Part label={WORDS.inOrder}>
        <ol className="flex flex-col gap-2">
          <Row name={WORDS.who} line={WORDS.whoLine} locked />
          {shape.brand.intro && (
            <Row name={WORDS.brandIn} line={WORDS.brandLine} />
          )}
          {format.scenes.flatMap((scene) => [
            ...(marked.has(scene.id)
              ? [<Chapter key={`${scene.id}-chapter`} />]
              : []),
            <Row key={scene.id} name={scene.name} line={sectionLine(scene)} />,
          ])}
          {shape.brand.outro && (
            <Row name={WORDS.brandOut} line={WORDS.brandLine} />
          )}
        </ol>
      </Part>
      <Part label={WORDS.captions}>
        <p className="text-sm">{WORDS.captioned[shape.subtitles]}</p>
        <p className="text-muted-foreground text-sm">
          {WORDS.chapters(marked.size)}
        </p>
      </Part>
    </>
  )
}
