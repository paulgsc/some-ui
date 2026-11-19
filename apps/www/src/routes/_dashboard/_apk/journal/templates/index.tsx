import type { JSX } from "react"
import { TEMPLATE_IDS, templateFormat } from "@some-ui/video-render"
import { createFileRoute } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { CardRoute } from "@/components/card-route"
import { StudioPage, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.templates

/** Every template, A to Z by its name, with its newest version's format. */
const TEMPLATES = TEMPLATE_IDS.map((id) => ({
  id,
  format: templateFormat(id),
})).sort((a, b) => a.format.title.localeCompare(b.format.title, "en"))

/**
 * Studio's Templates (SFEED1, #2731): every template home makes episodes
 * with, A to Z, each opening its shape, then the release promo (#2722),
 * which home makes for a release of an app when asked.
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
          <CardRoute
            to="/journal/templates/$template"
            params={{ template: id }}
          >
            <TileBody
              title={format.title}
              line={WORDS.version(format.version)}
            />
          </CardRoute>
        </li>
      ))}
      <li>
        <CardRoute to="/journal/templates/release-promo">
          <TileBody title={WORDS.promo.name} line={WORDS.promo.line} />
        </CardRoute>
      </li>
    </ul>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/templates/")({
  component: Templates,
})
