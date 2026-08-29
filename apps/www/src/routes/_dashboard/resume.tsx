import type { JSX, MouseEvent } from "react"
import { useEffect, useState } from "react"
import { useTheme } from "@/providers/theme"
import { resumeData, ResumeDocument } from "@some-ui/resume"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Download, Layers3, LayoutTemplate } from "lucide-react"

// GitHub Pages serves this app under /<repo>/ (see vite.config.ts's
// VITE_BASE_PATH); a bare "/resume.pdf" would request the domain root
// instead and 404 there. import.meta.env.BASE_URL always ends in "/", so
// this resolves correctly for GitHub Pages, the Docker/nginx build, and
// local dev alike.
// Order is a presentation decision and belongs here; the labels are content
// and do not. They used to be hard-coded alongside these ids and had already
// drifted - the selector said "Systems & browser infrastructure" while the
// document said "Distributed systems & infrastructure", so the card header
// and the résumé under it disagreed. Reading them from resumeData removes
// the last copy of résumé content in this app.
const RESUME_ORDER = ["backend", "platform", "fullstack"] as const
type ResumeComposition = (typeof RESUME_ORDER)[number]
const RESUME_COMPOSITIONS: ReadonlyArray<{
  id: ResumeComposition
  label: string
}> = RESUME_ORDER.map((id) => ({ id, label: resumeData[id].label }))
const RESUME_COMPOSITION_KEY = "some-ui:resume-composition"

// The *layout* axis, independent of which composition is selected — see
// packages/ui/resume/README.md's Templates section for what each one is.
// `rail` is the default/portfolio template and claims the unsuffixed
// `resume-<composition>.pdf` filename; every other template's PDF is
// suffixed `resume-<composition>-<template>.pdf` (scripts/typst.mjs's
// `stemFor`, mirrored here since this is a static site with no renderer to
// ask). Labels are UI copy for a layout choice, not résumé content, so —
// unlike RESUME_COMPOSITIONS above — they belong here rather than in
// @some-ui/resume.
const RESUME_TEMPLATES = [
  { id: "rail", label: "Rail (portfolio)" },
  { id: "classic", label: "Classic (single column)" },
  { id: "compact", label: "Compact" },
  { id: "vanilla", label: "Vanilla (plain ATS)" },
  { id: "safe", label: "Safe (ATS)" },
  { id: "conventional", label: "Conventional (traditional)" },
] as const
type ResumeTemplate = (typeof RESUME_TEMPLATES)[number]["id"]
const DEFAULT_TEMPLATE: ResumeTemplate = "rail"
const RESUME_TEMPLATE_KEY = "some-ui:resume-template"
const MOBILE_PREVIEW_QUERY = "(max-width: 767px)"
// A phone held sideways. `pointer: coarse` is what keeps a merely short
// desktop window out of this branch; height alone would catch both.
const TOUCH_LANDSCAPE_QUERY = "(max-height: 500px) and (pointer: coarse)"

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  )
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = (): void => setMatches(list.matches)
    update()
    list.addEventListener("change", update)
    return (): void => list.removeEventListener("change", update)
  }, [query])
  return matches
}

function isResumeComposition(value: string | null): value is ResumeComposition {
  return RESUME_COMPOSITIONS.some(({ id }) => id === value)
}

function initialComposition(): ResumeComposition {
  if (typeof window === "undefined") return "backend"
  const stored = localStorage.getItem(RESUME_COMPOSITION_KEY)
  return isResumeComposition(stored) ? stored : "backend"
}

function isResumeTemplate(value: string | null): value is ResumeTemplate {
  return RESUME_TEMPLATES.some(({ id }) => id === value)
}

function initialTemplate(): ResumeTemplate {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE
  const stored = localStorage.getItem(RESUME_TEMPLATE_KEY)
  return isResumeTemplate(stored) ? stored : DEFAULT_TEMPLATE
}

// Mirrors packages/ui/resume/scripts/typst.mjs's `stemFor`: the default
// template's PDF keeps the unsuffixed `resume-<composition>` name, every
// other template's is suffixed. This site has no renderer to ask for the
// filename, so the naming convention is duplicated here deliberately rather
// than guessed at.
function resumeStem(
  composition: ResumeComposition,
  template: ResumeTemplate
): string {
  return template === DEFAULT_TEMPLATE
    ? `resume-${composition}`
    : `resume-${composition}-${template}`
}

const ResumeRoute = (): JSX.Element => {
  const { resolved } = useTheme()
  const darkPreview = resolved.mode === "dark"
  const [composition, setCompositionState] =
    useState<ResumeComposition>(initialComposition)
  const [template, setTemplateState] = useState<ResumeTemplate>(initialTemplate)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pdfPath = `${import.meta.env.BASE_URL}${resumeStem(composition, template)}.pdf`
  // /resume is the one route this app's link is actually shared as a résumé
  // URL (see __root.tsx's public-route allowlist), so a social preview or
  // browser tab reading the app's generic "Some UI — Focused study
  // sessions" title is a real defect for the one audience that matters
  // here. Reads the name from @some-ui/resume rather than hard-coding it,
  // so this stays in step with whichever composition is selected without
  // re-introducing a second copy of résumé content in this app.
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${resumeData[composition].profile.name} — Résumé`
    return (): void => {
      document.title = previousTitle
    }
  }, [composition])
  const mobilePreview = useMediaQuery(MOBILE_PREVIEW_QUERY)
  // Landscape on a phone keeps the PDF, because that is what the platform
  // does with one. What it must not do is pretend: the browser's own embed
  // placeholder offers an "Open" control that silently downloads, and that
  // control is browser chrome - it cannot be relabelled or re-iconed from
  // here. So the embed is not rendered in this state at all, and the page
  // offers the download in its own words instead.
  const touchLandscape = useMediaQuery(TOUCH_LANDSCAPE_QUERY)
  const label =
    RESUME_COMPOSITIONS.find(({ id }) => id === composition)?.label ??
    RESUME_COMPOSITIONS[0].label
  const templateLabel =
    RESUME_TEMPLATES.find(({ id }) => id === template)?.label ??
    RESUME_TEMPLATES[0].label

  const selectComposition = (next: ResumeComposition): void => {
    localStorage.setItem(RESUME_COMPOSITION_KEY, next)
    setCompositionState(next)
    setMenu(null)
  }

  const cycleComposition = (): void => {
    const current = RESUME_COMPOSITIONS.findIndex(
      ({ id }) => id === composition
    )
    const next =
      RESUME_COMPOSITIONS[(current + 1) % RESUME_COMPOSITIONS.length] ??
      RESUME_COMPOSITIONS[0]
    selectComposition(next.id)
  }

  const selectTemplate = (next: ResumeTemplate): void => {
    localStorage.setItem(RESUME_TEMPLATE_KEY, next)
    setTemplateState(next)
    setMenu(null)
  }

  const cycleTemplate = (): void => {
    const current = RESUME_TEMPLATES.findIndex(({ id }) => id === template)
    const next =
      RESUME_TEMPLATES[(current + 1) % RESUME_TEMPLATES.length] ??
      RESUME_TEMPLATES[0]
    selectTemplate(next.id)
  }

  const openCompositionMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  return (
    <Card className="flex h-full flex-col" onContextMenu={openCompositionMenu}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Résumé</CardTitle>
          <p className="text-muted-foreground text-xs">
            {label} · {templateLabel}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            title="Show the next coherent one-page composition"
            onClick={cycleComposition}
          >
            <Layers3 />
            Next version
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            title="Switch to the next print layout (right-click for all layouts)"
            onClick={cycleTemplate}
          >
            <LayoutTemplate />
            Next layout
          </Button>
          {/* Hidden in phone landscape, where the panel below already offers
              the download - two buttons doing the same thing, one of them
              redundant, is how the browser's own control got mistaken for
              ours in the first place. */}
          {!touchLandscape && (
            <Button asChild size="sm">
              <a href={pdfPath} download="Paul_Gathondu_Resume.pdf">
                <Download />
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-6">
        <div
          className="relative isolate size-full overflow-auto rounded-md border md:overflow-hidden"
          onContextMenu={openCompositionMenu}
        >
          {touchLandscape ? (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-foreground text-sm font-medium">{label}</p>
              <p className="text-muted-foreground max-w-sm text-sm">
                A phone can’t display a PDF inside a page, so landscape offers
                the file itself. Rotate to portrait to read the résumé here
                instead.
              </p>
              <Button asChild size="sm">
                <a href={pdfPath} download="Paul_Gathondu_Resume.pdf">
                  <Download />
                  Download PDF
                </a>
              </Button>
            </div>
          ) : mobilePreview ? (
            // No mobile browser renders a PDF inline - Android Chrome hands it
            // to the download manager and iOS Safari shows a dead first page -
            // so the phone viewport gets the document as real HTML instead of
            // as an embed. It is the same content the PDF carries, rendered
            // from @some-ui/resume's exported data, so it stays selectable,
            // searchable and screen-reader navigable, inherits the app's theme
            // without the filter trick the PDF embed needs, and costs a few KB
            // rather than the 1.1 MB image this replaced.
            <ResumeDocument data={resumeData[composition]} />
          ) : (
            <>
              <iframe
                key={`${composition}-${template}`}
                src={pdfPath}
                title="Résumé preview"
                // Browser PDF viewers are isolated documents and do not expose a
                // theme API. Filtering the embedded surface keeps the preview in
                // step with the app without changing the downloadable PDF itself.
                className={`size-full transition-[filter] ${darkPreview ? "invert hue-rotate-180" : ""}`}
              />
              {darkPreview && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 mix-blend-multiply"
                  // Inversion alone turns black type into bright white. Tinting
                  // those light pixels with the active theme's foreground token
                  // preserves the repo's no-sun-white text invariant.
                  style={{ backgroundColor: resolved.swatch.fg }}
                />
              )}
            </>
          )}
        </div>
        {menu && (
          <>
            <button
              type="button"
              aria-label="Close résumé composition/layout menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenu(null)}
            />
            <div
              role="menu"
              aria-label="Résumé composition and layout"
              className="bg-popover text-popover-foreground fixed z-50 min-w-64 rounded-md border p-1 shadow-md"
              style={{ left: menu.x, top: menu.y }}
            >
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                One-page composition
              </p>
              {RESUME_COMPOSITIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === composition}
                  className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
                  onClick={() => selectComposition(option.id)}
                >
                  <span className="mr-2 w-3">
                    {option.id === composition ? "✓" : ""}
                  </span>
                  {option.label}
                </button>
              ))}
              <div className="bg-border my-1 h-px" role="separator" />
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                Print layout
              </p>
              {RESUME_TEMPLATES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === template}
                  className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
                  onClick={() => selectTemplate(option.id)}
                >
                  <span className="mr-2 w-3">
                    {option.id === template ? "✓" : ""}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/resume")({
  component: ResumeRoute,
})
