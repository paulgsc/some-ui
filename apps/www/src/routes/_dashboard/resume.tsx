import type { JSX, MouseEvent } from "react"
import { useState } from "react"
import { useTheme } from "@/providers/theme"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Download, Layers3 } from "lucide-react"

// GitHub Pages serves this app under /<repo>/ (see vite.config.ts's
// VITE_BASE_PATH); a bare "/resume.pdf" would request the domain root
// instead and 404 there. import.meta.env.BASE_URL always ends in "/", so
// this resolves correctly for GitHub Pages, the Docker/nginx build, and
// local dev alike.
const RESUME_COMPOSITIONS = [
  { id: "backend", label: "Backend & event-driven systems" },
  { id: "systems", label: "Systems & browser infrastructure" },
  { id: "learning", label: "Adaptive learning & product engineering" },
] as const
type ResumeComposition = (typeof RESUME_COMPOSITIONS)[number]["id"]
const RESUME_COMPOSITION_KEY = "some-ui:resume-composition"

function isResumeComposition(value: string | null): value is ResumeComposition {
  return RESUME_COMPOSITIONS.some(({ id }) => id === value)
}

function initialComposition(): ResumeComposition {
  if (typeof window === "undefined") return "backend"
  const stored = localStorage.getItem(RESUME_COMPOSITION_KEY)
  return isResumeComposition(stored) ? stored : "backend"
}

const ResumeRoute = (): JSX.Element => {
  const { resolved } = useTheme()
  const darkPreview = resolved.mode === "dark"
  const [composition, setCompositionState] =
    useState<ResumeComposition>(initialComposition)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pdfPath = `${import.meta.env.BASE_URL}resume-${composition}.pdf`
  const label = RESUME_COMPOSITIONS.find(({ id }) => id === composition)?.label

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

  const openCompositionMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  return (
    <Card className="flex h-full flex-col" onContextMenu={openCompositionMenu}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Résumé</CardTitle>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
        <div className="flex gap-2">
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
          <Button asChild size="sm">
            <a href={pdfPath} download="Paul_Gathondu_Resume.pdf">
              <Download />
              Download PDF
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-6">
        <div
          className="relative isolate size-full overflow-hidden rounded-md border"
          onContextMenu={openCompositionMenu}
        >
          <iframe
            key={composition}
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
        </div>
        {menu && (
          <>
            <button
              type="button"
              aria-label="Close résumé composition menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenu(null)}
            />
            <div
              role="menu"
              aria-label="Résumé composition"
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
