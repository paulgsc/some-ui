// ═══════════════════════════════════════════════════════════════════════════
//  Personal facts that are NOT derivable from the source repositories.
//
//  Everything in src/data/resume.typ is distilled from paulgsc/some-ui and
//  paulgsc/server — each claim traces to code, and src/canon/resume.meta.typ
//  records the trace. The fields below cannot be derived that way: degrees,
//  spoken languages, certifications, and non-engineering employment exist
//  outside both repositories.
//
//  Each one is filled only from the candidate's own records, and a field
//  with nothing to say stays empty rather than holding a plausible-looking
//  value. A résumé is used to make hiring claims about a real person, so an
//  invented certification or degree is not a placeholder — it is a false
//  statement waiting to be sent to an employer.
//
//  Every template renders a section only when its list is non-empty, so an
//  unfilled field costs nothing but the space it would have taken — the
//  fitting pass in src/lib/fit.typ redistributes it automatically, and the
//  page stays full.
// ═══════════════════════════════════════════════════════════════════════════

#let personal = (
  // Shown under the header when set, e.g. "Indianapolis, Indiana".
  location: "Berkeley, CA",

  // No phone number, LinkedIn URL or street address here, ever: this file
  // is committed and public. Those are supplied per build, and only through
  // the LAN render service (scripts/serve.mjs; src/lib/pii.typ says how).

  // Real and true (per the candidate's own non-engineering résumé), but not
  // wired into any template's render() yet: whether it is worth a line
  // depends on the specific posting, which a static build can't know. Set it
  // true in a one-off application copy rather than rendering it everywhere.
  work-authorization: "Authorized to work in the US for any employer",

  // (institution, credential, detail, dates)
  education: (
    (
      institution: "University of California, Merced",
      credential: "B.S. Mechanical Engineering",
      detail: "Merced, CA",
      dates: "2011 — 2015",
    ),
  ),

  // (name, note, level) — level is 1–5, rendered as the reference's dots.
  languages: (),
  //   (name: "English", note: "Native", level: 5),

  // (name, issuer, year)
  certifications: (),
  //   (name: "…", issuer: "…", year: "2024"),

  // (title, body) — short, and only if they support the application.
  interests: (),

  // Non-engineering roles, all four from the candidate's non-engineering
  // résumé (src/canon/resume.meta.typ, "Non-engineering employment
  // history"), each with its own dates. Keep the same shape as an engineering
  // entry so the templates render them without a special case. Each
  // composition in resume.typ names, by `org`, which of these it renders.
  //
  additional-experience: (
    (
      role: "Data Administrator",
      org: "CABA Design",
      detail: "Rancho Cordova, CA",
      dates: "2020 — 2023",
      bullets: (
        "Built interactive Tableau dashboards on PostgreSQL for daily operational visibility.",
        "Automated executive reporting through Google Workspace API integration, saving 10+ hours weekly.",
        "Automated record creation and resolved data issues with Python scripts against Odoo's XML-RPC API, eliminating manual intervention.",
      ),
    ),
    (
      role: "Inventory Specialist",
      org: "WIS",
      detail: "Sacramento, CA",
      dates: "2024 — Present",
      bullets: (
        "Cycle counting and 10-key data entry at 99.9%+ accuracy.",
        "Reconcile physical counts against system records daily.",
      ),
    ),
    (
      role: "Clinical Data Operator",
      org: "Natera",
      detail: "San Carlos, CA",
      dates: "2019 — 2020",
      bullets: (
        "HIPAA-compliant LIMS sample accessioning at 99.99% accuracy.",
        "Processed 30+ kits per hour; recognized as a top performer for speed and regulatory adherence.",
      ),
    ),
    (
      role: "Distribution Assistant",
      org: "PayLocity",
      detail: "Oakland, CA",
      dates: "2017 — 2019",
      bullets: (
        "Weekly inventory audits with zero discrepancies.",
        "Named Top Performing Employee for error-free execution.",
      ),
    ),
  ),
)
