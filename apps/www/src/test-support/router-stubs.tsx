/**
 * `@tanstack/react-router` with `Link` as a plain `<a>`, for a `vi.mock`
 * factory: `vi.mock("@tanstack/react-router", async (importOriginal) =>
 * withPlainLink(await importOriginal()))`.
 */
import type { JSX, ReactNode } from "react"
import type * as ReactRouterModule from "@tanstack/react-router"

export function withPlainLink(
  actual: typeof ReactRouterModule
): typeof ReactRouterModule {
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- LinkComponent's real signature is generic over the whole route tree; a plain <a> stand-in has no narrower match.
    Link: (({ children, ...props }: { children?: ReactNode }) => (
      <a {...props}>{children}</a>
    )) as typeof ReactRouterModule.Link,
  }
}

/** A file route's component, for rendering it directly in a test. */
export function routeComponent(route: {
  options: { component?: unknown }
}): () => JSX.Element {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createFileRoute's Route.options.component is typed broader than the concrete component a route registered; there is no narrower accessor.
  return route.options.component as () => JSX.Element
}
