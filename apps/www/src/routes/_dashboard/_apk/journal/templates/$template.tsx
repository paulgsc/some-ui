import type { JSX } from "react"
import type { TemplateId } from "@some-ui/video-render"
import {
  isTemplateId,
  markThemeOf,
  templateCaptions,
  templateFormat,
  templateStoryboard,
} from "@some-ui/video-render"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { lookNamed } from "@/lib/caption-look"
import { FEED_TEMPLATES } from "@/lib/feeds"
import {
  FEED_FACTS,
  FEEDS_A_TO_Z,
  STUDIO_INDEX_WORDS,
} from "@/lib/studio-index"
import { CaptionLook } from "@/components/studio/caption-look"
import { StudioPage } from "@/components/studio/layout"
import { MarkTheme } from "@/components/studio/mark-theme"
import { TemplateShape } from "@/components/studio/template"

const WORDS = STUDIO_INDEX_WORDS.templates

/** The caption look the template is drawn in, and its control (SFEED11). */
const LookOf = ({
  template,
  title,
}: {
  template: TemplateId
  title: string
}): JSX.Element => {
  const { look: named, frame } = templateCaptions(template)
  const look = lookNamed(named)
  return look === null ? (
    <p className="text-muted-foreground text-sm">{WORDS.look.none}</p>
  ) : (
    <CaptionLook
      key={template}
      template={{ id: template, title }}
      from={look.id}
      look={look}
      frame={frame}
    />
  )
}

/**
 * One template (SFEED1, #2731): its newest version, the feeds that use it,
 * its storyboard (SFEED3, #2744), every frame from the locked intro to the
 * brand outro, its caption look (SFEED11) and, where it has brand slides,
 * its mark's theme (SFEED14).
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
      back="templates"
    >
      {feeds.map((feed) => (
        <Link
          key={feed}
          to="/journal/feeds/$feed"
          params={{ feed }}
          className="text-brand self-start text-sm font-semibold underline underline-offset-4"
        >
          {WORDS.usedBy(FEED_FACTS[feed].name)}
        </Link>
      ))}
      <TemplateShape format={format} board={templateStoryboard(template)} />
      <LookOf template={template} title={format.title} />
      {(format.shape?.brand.intro === true ||
        format.shape?.brand.outro === true) && (
        <MarkTheme
          key={template}
          template={{ id: template, title: format.title }}
          from={markThemeOf(format.shape)}
        />
      )}
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
