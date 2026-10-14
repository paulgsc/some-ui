import type { JSX, SubmitEvent } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { Pii } from "@some-ui/resume"
import { PII_FIELD_NAMES, PII_FIELDS, PII_TEMPLATES } from "@some-ui/resume"
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Download, FileText, LoaderCircle } from "lucide-react"

import type { ResumeBuildRuntime } from "@/lib/resume-build"
import { createResumeBuild, serviceRender } from "@/lib/resume-build"
import { RESUME_COMPOSITIONS, RESUME_TEMPLATES } from "@/lib/resume-options"

const TEMPLATES = PII_TEMPLATES.map((id) => ({
  id,
  label: RESUME_TEMPLATES.find((template) => template.id === id)?.label ?? id,
}))
const FIELDS = PII_FIELD_NAMES.map((field) => ({
  field,
  rule: PII_FIELDS[field],
}))

const createRuntime = (): ResumeBuildRuntime =>
  createResumeBuild({
    render: serviceRender,
    urls: {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
  })

/**
 * Builds an ATS résumé with contact details that are never committed, on the
 * home network's résumé service (`packages/ui/resume/scripts/serve.mjs`). LAN
 * only because only the LAN deployment proxies `/api/resume/` to it. Autofill
 * is off so the browser keeps no copy of the fields.
 */
const ResumeBuildRoute = (): JSX.Element => {
  const [runtime] = useState(createRuntime)
  useEffect(
    () => (): void => {
      runtime.dispose()
    },
    [runtime]
  )
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

  const [variant, setVariant] = useState<string>("backend")
  const [template, setTemplate] = useState<string>("classic")
  const [pii, setPii] = useState<Pii>({})

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    runtime.build({ variant, template, pii })
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5" />
          Résumé with contact details
        </CardTitle>
        <CardDescription>
          Built on the home network, never committed. What you type goes out in
          one request and is kept nowhere: not in this browser, the service or
          its logs. Leave a field empty to leave it off.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <form
          className="flex shrink-0 flex-col gap-3 md:w-80"
          onSubmit={submit}
          autoComplete="off"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resume-build-variant">Composition</Label>
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger id="resume-build-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESUME_COMPOSITIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resume-build-template">Layout</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger id="resume-build-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {FIELDS.map(({ field, rule }) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`resume-build-${field}`}>{rule.label}</Label>
              <Input
                id={`resume-build-${field}`}
                value={pii[field] ?? ""}
                placeholder={rule.example}
                maxLength={rule.maxLength}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setPii((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <Button type="submit" disabled={state.status === "rendering"}>
            {state.status === "rendering" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileText />
            )}
            Build PDF
          </Button>
          {state.status === "refused" && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          {state.status === "ready" && (
            <Button asChild variant="outline">
              <a href={state.url} download={state.filename}>
                <Download />
                Download {state.filename}
              </a>
            </Button>
          )}
        </form>
        <div className="min-h-96 min-w-0 flex-1 overflow-hidden rounded-md border">
          {state.status === "ready" ? (
            <iframe
              src={state.url}
              title="Built résumé"
              className="size-full"
            />
          ) : (
            <p className="text-muted-foreground flex size-full items-center justify-center p-6 text-center text-sm">
              {state.status === "rendering"
                ? "Building…"
                : "The PDF appears here once it is built."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/_lan/resume-build")({
  component: ResumeBuildRoute,
})
