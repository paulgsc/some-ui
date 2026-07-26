import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "some-ui-shared"

// GitHub Pages serves this app under /<repo>/ (see vite.config.ts's
// VITE_BASE_PATH); a bare "/resume.pdf" would request the domain root
// instead and 404 there. import.meta.env.BASE_URL always ends in "/", so
// this resolves correctly for GitHub Pages, the Docker/nginx build, and
// local dev alike.
const RESUME_PDF_PATH = `${import.meta.env.BASE_URL}resume.pdf`

const ResumeRoute = (): JSX.Element => (
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
      <iframe
        src={RESUME_PDF_PATH}
        title="Résumé preview"
        className="size-full rounded-md border"
      />
    </CardContent>
  </Card>
)

export const Route = createFileRoute("/_dashboard/resume")({
  component: ResumeRoute,
})
