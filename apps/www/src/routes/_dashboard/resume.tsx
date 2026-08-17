import type { JSX } from "react"
import { useTheme } from "@/providers/theme"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"

// GitHub Pages serves this app under /<repo>/ (see vite.config.ts's
// VITE_BASE_PATH); a bare "/resume.pdf" would request the domain root
// instead and 404 there. import.meta.env.BASE_URL always ends in "/", so
// this resolves correctly for GitHub Pages, the Docker/nginx build, and
// local dev alike.
const RESUME_PDF_PATH = `${import.meta.env.BASE_URL}resume.pdf`

const ResumeRoute = (): JSX.Element => {
  const { resolved } = useTheme()
  const darkPreview = resolved.mode === "dark"

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Résumé</CardTitle>
        <Button asChild size="sm">
          <a href={RESUME_PDF_PATH} download="Paul_Gathondu_Resume.pdf">
            <Download />
            Download PDF
          </a>
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-6">
        <div className="relative isolate size-full overflow-hidden rounded-md border">
          <iframe
            src={RESUME_PDF_PATH}
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
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/resume")({
  component: ResumeRoute,
})
