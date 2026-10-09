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

// Order is a presentation decision and belongs here; the labels are résumé
// content and come from resumeData, so the selector and document agree.
const RESUME_ORDER = ["backend", "platform", "fullstack"] as const
type ResumeComposition = (typeof RESUME_ORDER)[number]
const RESUME_COMPOSITIONS: ReadonlyArray<{
  id: ResumeComposition
  label: string
}> = RESUME_ORDER.map((id) => ({ id, label: resumeData[id].label }))
const RESUME_COMPOSITION_KEY = "some-ui:resume-composition"

// The *layout* axis, independent of composition (packages/ui/resume/README.md,
// Templates). Labels are UI copy, so they belong here, not in @some-ui/resume.
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
    // eslint-disable-next-line owner-guard/no-mount-snapshot -- the first paint's answer; the effect below re-reads it whenever `query` changes
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

// Mirrors packages/ui/resume/scripts/typst.mjs's `stemFor` (a static site has
// no renderer to ask): `rail`, the default, keeps the unsuffixed
// `resume-<composition>` name; every other template's is suffixed.
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
  // Under BASE_URL: Pages serves the app under /<repo>/, where "/resume.pdf" 404s.
  const pdfPath = `${import.meta.env.BASE_URL}${resumeStem(composition, template)}.pdf`
  // /resume is the route shared as a résumé URL, so the tab and social
  // preview should carry the name, read from @some-ui/resume.
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${resumeData[composition].profile.name} — Résumé`
    return (): void => {
      document.title = previousTitle
    }
  }, [composition])
  const mobilePreview = useMediaQuery(MOBILE_PREVIEW_QUERY)
  // Landscape on a phone keeps the PDF, but not the browser's embed: its
  // "Open" placeholder silently downloads and cannot be relabelled, so the
  // page offers the download in its own words instead.
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
              the download. */}
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
            // A phone's browser downloads a PDF rather than showing it, so
            // phones get the same content as HTML from @some-ui/resume's
            // data: selectable, searchable, screen-reader navigable and themed.
            <ResumeDocument data={resumeData[composition]} />
          ) : (
            <>
              <iframe
                key={`${composition}-${template}`}
                src={pdfPath}
                title="Résumé preview"
                // Browser PDF viewers expose no theme API; filtering the embed
                // keeps the preview in step without changing the PDF.
                className={`size-full transition-[filter] ${darkPreview ? "invert hue-rotate-180" : ""}`}
              />
              {darkPreview && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 mix-blend-multiply"
                  // Inversion alone turns black type bright white; tinting with
                  // the foreground token keeps the no-sun-white text invariant.
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
