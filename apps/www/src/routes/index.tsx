import { ShipLogDashboard } from "@some-ui/ship-log"

import "@some-ui/ship-log/style.css"

import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Ship Log — Milestones of the Engineering Emotional Rollercoaster",
      },
      {
        name: "description",
        content:
          "Green builds, deleted legacy code, rollbacks and pager storms — an engineering milestone board for every feeling a codebase gives you.",
      },
      { property: "og:title", content: "Ship Log — Engineering milestones" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShipLogDashboard,
})
