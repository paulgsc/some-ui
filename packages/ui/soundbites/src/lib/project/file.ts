/**
 * The project file: one JSON document holding a Studio project's revisions,
 * notes, takes and sitting log, everything but audio. It is small enough to
 * travel with every share, and any sitting or session resumes from it alone.
 *
 * Reading checks every revision as the renderer would (`parseCutList`), so
 * a file the phone accepts is one the renderer can draw at any revision.
 */
import type { Parsed } from "@some-ui/video-render"
import { CutListSchema, parseCutList } from "@some-ui/video-render"
import { z } from "zod"

import type { Project } from "./model"
import { cutListAt, PROJECT_SCHEMA } from "./model"

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
const at = z.iso.datetime()
const author = z.enum(["owner", "claude"])

const ProjectSchema = z.object({
  schema: z.literal(PROJECT_SCHEMA),
  id,
  revisions: z
    .array(
      z.object({
        rev: z.number().int().positive(),
        author,
        message: z.string().min(1),
        at,
        // Checked again whole by `parseCutList`, with its history put back.
        cutList: CutListSchema.omit({ revisions: true, notes: true }),
      })
    )
    .min(1),
  notes: z.array(
    z.object({
      id,
      rev: z.number().int().positive(),
      shot: id,
      offsetMs: z.number().int().nonnegative(),
      author,
      text: z.string().min(1),
      status: z.enum(["open", "applied", "declined", "confirmed"]),
      reason: z.string().min(1).optional(),
    })
  ),
  takes: z.array(
    z.object({
      id,
      shot: id,
      recordedAt: at,
      durationMs: z.number().int().positive(),
      mimeType: z.string().min(1),
      keptBy: z.array(z.enum(["home", "drive"])),
      onPhone: z.boolean(),
    })
  ),
  chosen: z.record(id, id),
  sittings: z.array(
    z.object({
      id,
      openedAt: at,
      closedAt: at.nullable(),
      done: z.string(),
      next: z.string(),
    })
  ),
})

/** The project as its file: stable key order, two-space indents. */
export function projectFile(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`
}

function shapeProblems(project: Project): Array<string> {
  const problems: Array<string> = []
  project.revisions.forEach((revision, index) => {
    if (revision.rev !== index + 1)
      problems.push(`revisions.${index}: expected rev ${index + 1}`)
    const cutList = parseCutList(cutListAt(project, revision.rev))
    if (!cutList.ok)
      problems.push(
        ...cutList.problems.map((line) => `rev ${revision.rev}: ${line}`)
      )
  })
  for (const [shot, take] of Object.entries(project.chosen)) {
    if (!project.takes.some((each) => each.id === take && each.shot === shot))
      problems.push(`chosen.${shot}: no take ${take} for that shot`)
  }
  if (project.sittings.slice(0, -1).some((each) => each.closedAt === null))
    problems.push("sittings: only the last can be open")
  return problems
}

/** The project in `source`, or every reason it can't be resumed from. */
export function readProjectFile(source: string): Parsed<Project> {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, problems: ["not JSON"] }
  }
  const parsed = ProjectSchema.safeParse(raw)
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "project"}: ${issue.message}`
      ),
    }
  const project: Project = parsed.data
  const problems = shapeProblems(project)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: project }
}
