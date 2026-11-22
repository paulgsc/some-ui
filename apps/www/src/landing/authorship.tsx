/**
 * The public site's one script (PAGES, #3401; C1055): the authorship record
 * every published video's end card links to (STUDIO ST16), drawn from the
 * record its link carries (`?r`, `@some-ui/burn-ins`' `recordLink`) and
 * nothing else. No router, no app and no storage around it; the page keeps
 * nothing. Its template is landing/authorship.html.
 */
import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import { AuthorshipRecord } from "@/lib/web-surface"

// The record's stage keeps its frame in authored CSS beside its component,
// which the Tailwind pass (page.css) does not carry; pulled from package
// source as main.tsx pulls every package's.
import.meta.glob(["../../../../packages/ui/burn-ins/src/**/*.css"], {
  eager: true,
})

const mount = document.getElementById("record")
if (mount === null) throw new Error("landing/authorship.html has no #record")

createRoot(mount).render(
  <StrictMode>
    <Suspense>
      <AuthorshipRecord
        code={new URLSearchParams(window.location.search).get("r") ?? undefined}
      />
    </Suspense>
  </StrictMode>
)
