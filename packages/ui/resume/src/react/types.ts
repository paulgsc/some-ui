// The résumé's shape in TypeScript, declared once.
//
// Only the types index.ts re-exports are `export`ed; the rest compose
// ResumeData and stay internal until something outside actually needs them.
//
// src/react/generated/data.ts is annotated with these types, so `tsc` checks
// the exported data against them — if src/data/resume.typ changes shape, the
// build fails here rather than the web view silently rendering blanks.
//
// This is the piece of the web view that outlives the build script feeding it:
// when rendering moves to a service (paulgsc/some-ui#1132), this is what that
// service's response body has to satisfy.

export type ResumeVariant = "backend" | "platform" | "fullstack"

type ResumeProfile = {
  name: string
  title: string
  email: string
  github: string
  portfolio: string
  location: string | null
}

export type ResumeProject = {
  name: string
  kind: string
  premise: string
  bullets: ReadonlyArray<string>
}

export type ResumeHighlight = { title: string; body: string }
export type ResumeToolboxGroup = { label: string; items: string }
export type ResumeRepository = { name: string; body: string }

type ResumeEngagement = {
  role: string
  org: string
  dates: string
  note: string
}

// Facts that cannot be derived from the source repositories. These live in
// src/data/personal.typ and ship empty; every consumer renders them only when
// non-empty. See that file for why they are not filled with placeholders.
type ResumeRole = {
  role: string
  org: string
  detail: string | null
  dates: string
  bullets: ReadonlyArray<string>
}

type ResumeEducation = {
  institution: string
  credential: string
  detail: string | null
  dates: string
}

type ResumeCertification = { name: string; issuer: string; year: string }
type ResumeLanguage = { name: string; note: string; level: number }
type ResumeInterest = { title: string; body: string }

export type ResumeData = {
  variant: ResumeVariant
  profile: ResumeProfile
  label: string
  summary: string
  skills: string
  projects: ReadonlyArray<ResumeProject>
  platform: ReadonlyArray<string>
  highlights: ReadonlyArray<ResumeHighlight>
  toolbox: ReadonlyArray<ResumeToolboxGroup>
  repositories: ReadonlyArray<ResumeRepository>
  engagement: ResumeEngagement
  additionalExperience: ReadonlyArray<ResumeRole>
  education: ReadonlyArray<ResumeEducation>
  certifications: ReadonlyArray<ResumeCertification>
  languages: ReadonlyArray<ResumeLanguage>
  interests: ReadonlyArray<ResumeInterest>
}
