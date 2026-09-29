import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

/** Index of the LAN-only pages. */
const LanIndexRoute = (): JSX.Element => (
  <section className="flex flex-col gap-2 p-6">
    <h1 className="text-2xl font-semibold">LAN tools</h1>
    <p className="text-muted-foreground">
      Pages for services on the home network.
    </p>
    <ul className="list-disc pl-5">
      <li>
        <Link to="/lessons" className="underline underline-offset-4">
          Lessons
        </Link>
        : the lessons the server serves, and this week&apos;s batch.
      </li>
      <li>
        <Link to="/rounds" className="underline underline-offset-4">
          Rounds
        </Link>
        : the LeetType rounds the server serves.
      </li>
    </ul>
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/lan")({
  component: LanIndexRoute,
})
