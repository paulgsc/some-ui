import type { JSX, SubmitEvent } from "react"
import { useState } from "react"
import type { EnqueueResult, JobEntry, JobStatus } from "@some-ui/job-tracker"
import { isFull, MAX_QUEUE_SIZE } from "@some-ui/job-tracker"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react"

import { createJobTrackerRepository } from "@/lib/job-tracker"

// A single repository instance for the life of the tab: this queue has no
// server counterpart and no reason to be re-created per render, only read
// and written through — same reasoning as the module-level `resumeData`
// import in the résumé route.
const repository = createJobTrackerRepository()

const STATUS_LABEL: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
}
const STATUS_ORDER: ReadonlyArray<JobStatus> = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
]
const STATUS_SET: ReadonlySet<string> = new Set(STATUS_ORDER)

// Radix's Select reports the new value as a plain string; this narrows it
// back to JobStatus without a type assertion (this project's eslint config
// bans `as` entirely — @typescript-eslint/consistent-type-assertions).
function isJobStatus(value: string): value is JobStatus {
  return STATUS_SET.has(value)
}

function badgeVariantFor(
  status: JobStatus
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "offer") return "default"
  if (status === "rejected") return "destructive"
  if (status === "interviewing" || status === "applied") return "secondary"
  return "outline"
}

type FormState = {
  company: string
  role: string
  url: string
  notes: string
}

const EMPTY_FORM: FormState = { company: "", role: "", url: "", notes: "" }

// Blocking content shown in place of the form once the queue is at
// capacity: this is a queue meant to be worked through, not an
// ever-growing backlog, so adding a lead is deliberately gated on removing
// or resolving one already there rather than silently allowed to grow.
const FullQueueNotice = ({
  oldest,
  onPruneOldest,
}: {
  oldest: JobEntry | null
  onPruneOldest: () => void
}): JSX.Element => (
  <div className="flex flex-col gap-3 py-2 text-sm">
    <p className="text-muted-foreground">
      The queue is full at {MAX_QUEUE_SIZE} leads. Remove or resolve one before
      adding another — this is meant to stay a short, current list, not a
      growing archive.
    </p>
    {oldest && (
      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {oldest.role} · {oldest.company}
          </p>
          <p className="text-muted-foreground text-xs">Oldest in the queue</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPruneOldest}
        >
          <Trash2 />
          Remove it
        </Button>
      </div>
    )}
  </div>
)

const AddJobDialog = ({
  jobs,
  onAdded,
}: {
  jobs: ReadonlyArray<JobEntry>
  onAdded: () => void
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [result, setResult] = useState<EnqueueResult | null>(null)
  const full = isFull(jobs)

  const closeAndReset = (): void => {
    setOpen(false)
    setForm(EMPTY_FORM)
    setResult(null)
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const outcome = repository.add({
      company: form.company,
      role: form.role,
      url: form.url || null,
      notes: form.notes || null,
    })
    setResult(outcome)
    if (outcome.ok) {
      onAdded()
      closeAndReset()
    }
  }

  const handlePruneOldest = (): void => {
    const oldest = repository.oldest()
    if (!oldest) return
    repository.remove(oldest.id)
    onAdded()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : closeAndReset())}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus />
          Add lead
        </Button>
      </DialogTrigger>
      <DialogContent showOverlay>
        <DialogHeader>
          <DialogTitle>Add a job lead</DialogTitle>
          <DialogDescription>
            {full
              ? "The queue needs room before another lead can be added."
              : `${jobs.length} of ${MAX_QUEUE_SIZE} in the queue.`}
          </DialogDescription>
        </DialogHeader>
        {full ? (
          <FullQueueNotice
            oldest={repository.oldest()}
            onPruneOldest={handlePruneOldest}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="job-company">Company</Label>
              <Input
                id="job-company"
                value={form.company}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job-role">Role</Label>
              <Input
                id="job-role"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job-url">Posting URL (optional)</Label>
              <Input
                id="job-url"
                type="url"
                inputMode="url"
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job-notes">Notes (optional)</Label>
              <Textarea
                id="job-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
            {result && !result.ok && result.reason === "invalid" && (
              <p className="text-destructive text-sm">{result.message}</p>
            )}
            <DialogFooter>
              <Button type="submit">Add to queue</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

const JobRow = ({
  job,
  onStatusChange,
  onRemove,
}: {
  job: JobEntry
  onStatusChange: (id: string, status: JobStatus) => void
  onRemove: (id: string) => void
}): JSX.Element => (
  <Card>
    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-h-0 min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{job.role}</p>
          <Badge variant={badgeVariantFor(job.status)}>
            {STATUS_LABEL[job.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground truncate text-sm">{job.company}</p>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs underline"
          >
            <ExternalLink className="size-3" />
            Posting
          </a>
        )}
        {job.notes && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {job.notes}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Select
          value={job.status}
          onValueChange={(value) => {
            if (isJobStatus(value)) onStatusChange(job.id, value)
          }}
        >
          <SelectTrigger className="h-9 w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove ${job.role} at ${job.company}`}
          onClick={() => onRemove(job.id)}
        >
          <Trash2 />
        </Button>
      </div>
    </CardContent>
  </Card>
)

const JobsRoute = (): JSX.Element => {
  const [jobs, setJobs] = useState<ReadonlyArray<JobEntry>>(() =>
    repository.list()
  )

  const refresh = (): void => setJobs(repository.list())

  const handleRemove = (id: string): void => {
    // Matches the confirm() convention used for every other destructive
    // action in this app (sessions/index.tsx) — no confirm-dialog component
    // exists in @some-ui/shared yet.
    if (!confirm("Remove this lead from the queue?")) return
    repository.remove(id)
    refresh()
  }

  const handleStatusChange = (id: string, status: JobStatus): void => {
    repository.updateStatus(id, status)
    refresh()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Job Tracker</CardTitle>
            <p className="text-muted-foreground text-xs">
              {jobs.length} of {MAX_QUEUE_SIZE} leads
            </p>
          </div>
          <AddJobDialog jobs={jobs} onAdded={refresh} />
        </CardHeader>
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Sparkles className="size-6" />
            <p>No leads yet.</p>
            <p className="max-w-xs">
              Add a role you&apos;re applying to. The queue holds up to{" "}
              {MAX_QUEUE_SIZE} at a time, on purpose — a short, current list
              beats a long, stale one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...jobs]
            .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
            .map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onStatusChange={handleStatusChange}
                onRemove={handleRemove}
              />
            ))}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/jobs")({
  component: JobsRoute,
})
