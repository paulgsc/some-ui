import type { JSX } from "react"
import type { TemplateId } from "@some-ui/video-render"
import { isTemplateId, templateFormat } from "@some-ui/video-render"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { FEED_TEMPLATES } from "@/lib/feeds"
import { feedName, FEEDS_A_TO_Z, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { BACK, StudioPage } from "@/components/studio/layout"
import { TemplateShape } from "@/components/studio/template"

const WORDS = STUDIO_INDEX_WORDS.templates

/**
 * One template (SFEED1, #2731): its newest version, the feeds that use it,
 * and its shape, from the locked intro to the brand outro.
 */
const TemplatePage = (): JSX.Element => {
  const { template }: { template: TemplateId } = Route.useParams()
  const format = templateFormat(template)
  const feeds = FEEDS_A_TO_Z.filter((feed) =>
    FEED_TEMPLATES[feed].includes(template)
  )
  return (
    <StudioPage
      heading={format.title}
      intro={WORDS.version(format.version)}
      back={
        <Link to="/journal/templates" className={BACK}>
          {STUDIO_INDEX_WORDS.backTo("templates")}
        </Link>
      }
    >
      {feeds.map((feed) => (
        <Link
          key={feed}
          to="/journal/feeds/$feed"
          params={{ feed }}
          className="text-brand self-start text-sm font-semibold underline underline-offset-4"
        >
          {WORDS.usedBy(feedName(feed))}
        </Link>
      ))}
      <TemplateShape format={format} />
    </StudioPage>
  )
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/templates/$template"
)({
  params: {
    parse: ({ template }): { template: TemplateId } => {
      if (!isTemplateId(template)) throw notFound()
      return { template }
    },
    stringify: ({
      template,
    }: {
      template: TemplateId
    }): { template: string } => ({
      template,
    }),
  },
  component: TemplatePage,
})
