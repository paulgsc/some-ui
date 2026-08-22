// ═══════════════════════════════════════════════════════════════════════════
//  Personal facts that are NOT derivable from the source repositories.
//
//  Everything in src/data/resume.typ is distilled from paulgsc/some-ui and
//  paulgsc/server — each claim traces to code, and src/canon/resume.meta.typ
//  records the trace. The fields below cannot be derived that way: degrees,
//  spoken languages, certifications, and non-engineering employment exist
//  outside both repositories.
//
//  They are therefore left EMPTY rather than filled with plausible-looking
//  values. A résumé is used to make hiring claims about a real person, so an
//  invented certification or degree is not a placeholder — it is a false
//  statement waiting to be sent to an employer. Fill these in from your own
//  records.
//
//  Every template renders a section only when its list is non-empty, so an
//  unfilled field costs nothing but the space it would have taken — the
//  fitting pass in src/lib/fit.typ redistributes it automatically, and the
//  page stays full.
// ═══════════════════════════════════════════════════════════════════════════

#let personal = (
  // Shown under the header when set, e.g. "Indianapolis, Indiana".
  location: none,

  // (institution, credential, detail, dates)
  education: (),
  // Example, once you have the real values to hand:
  //   (
  //     institution: "…",
  //     credential: "B.S. Computer Science",
  //     detail: "…",
  //     dates: "2015 — 2019",
  //   ),

  // (name, note, level) — level is 1–5, rendered as the reference's dots.
  languages: (),
  //   (name: "English", note: "Native", level: 5),

  // (name, issuer, year)
  certifications: (),
  //   (name: "…", issuer: "…", year: "2024"),

  // (title, body) — short, and only if they support the application.
  interests: (),

  // Non-engineering roles. Keep the same shape as an engineering entry so the
  // templates can render them without a special case: the résumé is stronger
  // for showing continuous employment, and transferable evidence (ownership,
  // throughput, customer contact) belongs on the page when it is real.
  //
  // (role, org, detail, dates, bullets)
  additional-experience: (),
  //   (
  //     role: "…",
  //     org: "…",
  //     detail: "…",
  //     dates: "2019 — 2023",
  //     bullets: ("…",),
  //   ),
)
