---
"@some-ui/resume": minor
"www": minor
---

Rewrite the résumé to communicate what the work actually is, and give
`apps/www` a mission page motivating the repo's high-level goals.

**`@some-ui/resume` — STAR grammar, project-first.**

The previous revision stated deliverables only, on the theory that a résumé
is a pure evidence index. Read against the user stories behind these
projects, that turned out to be an over-correction: stripped to deliverables,
the work read like ordinary feature output, and nothing distinguished it from
a ticket someone was handed. These projects are positions — a browser is an
operating system and tabs are its processes; exposure should be opt-in;
visual comfort is measurable; a curriculum should adapt to the learner — and
omitting the position deletes the reason the artifact exists.

`resume.typ` now leads each project with the premise it answers and then
cashes that premise out in the mechanism implementing it, under an explicit
rule: **a premise earns its place only if the next line names the mechanism.**
"Suspension is virtualization, not cleanup" is followed by the native-discard
behaviour and the absent `tabs.remove()`; "nothing earns attention by default"
is followed by the `masked → meta → title → revealed` machine and the
overloads that make an illegal transition a compile error.

Also:

- **Dropped the "Technical Skills" enumeration.** A comma-separated tool list
  communicates nothing verifiable. Every tool in it still appears in the
  résumé, attached to the thing it was used to build.
- **Dropped the "Set in Typst from `packages/ui/resume/resume.typ`…"**
  colophon — a note about the document's own build pipeline on a page whose
  job is to be about the candidate. The pipeline stays documented in
  `README.md`.
- **Corrected the workspace counts** (61 → 58 packages, "15+" → 12
  extensions); both are now derived rather than remembered, with the
  derivation recorded in `resume.meta.typ`.
- `resume.meta.typ` gains a per-project provenance map (claim → the crate,
  package, or workflow backing it) and records the format reversal.

**`www` — a `/mission` route.**

`/` answers _what_ is deployed here and sends you to it; nothing answered why
any of it exists. `/mission` is a visual statement page — not a journal or a
blog, no dates and no posts — presenting each project as one refusal, one
claim, and one mechanism, followed by the principles they share and the scale
they ship at. Linked from `/` as a secondary text link so it doesn't compete
with the three destination cards.
