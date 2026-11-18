/**
 * A route tree under a router of its own, opened at a path in memory: for
 * a screen whose links are routes, in a test or on a fit page.
 */
import type { JSX } from "react"
import { useState } from "react"
import type { AnyRoute } from "@tanstack/react-router"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"

export type MemoryRoutedProps = {
  /** The tree, made once, on mount. */
  initialTree: () => AnyRoute
  /** Where it opens. */
  initialPath: string
}

export const MemoryRouted = ({
  initialTree,
  initialPath,
}: MemoryRoutedProps): JSX.Element => {
  const [router] = useState(() =>
    createRouter({
      routeTree: initialTree(),
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    })
  )
  return <RouterProvider router={router} />
}
