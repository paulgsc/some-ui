import type { JSX } from "react"
import { TEMPLATE_IDS, templateFormat } from "@some-ui/video-render"
import { createFileRoute, Link } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.templates

/** Every template, A to Z by its name, with its newest version's format. */
const TEMPLATES = TEMPLATE_IDS.map((id) => ({
  id,
  format: templateFormat(id),
})).sort((a, b) => a.format.title.localeCompare(b.format.title, "en"))

/**
 * Studio's Templates (SFEED1, #2731): every template home makes episodes
 * with, A to Z, each opening its shape.
 */
const Templates = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.templates.name}
    intro={WORDS.intro}
    back="index"
  >
    <ul className="flex flex-col gap-2">
      {TEMPLATES.map(({ id, format }) => (
        <li key={id}>
          <Link
            to="/journal/templates/$template"
            params={{ template: id }}
            className={TILE}
          >
            <TileBody
              title={format.title}
              line={WORDS.version(format.version)}
            />
          </Link>
        </li>
      ))}
    </ul>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/templates/")({
  component: Templates,
})
