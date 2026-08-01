import type { JSX } from "react"
import { Link } from "@tanstack/react-router"
import { Home, MapPinOff } from "lucide-react"
import { Button } from "@some-ui/shared"

/**
 * 404 page. Wired as the router's `defaultNotFoundComponent`, so any
 * unmatched path (or a route throwing `notFound()`) lands here.
 */
export const NotFound = (): JSX.Element => (
  <main className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
    <MapPinOff className="text-muted-foreground size-12" aria-hidden />
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm font-medium">Error 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
    </div>
    <Button asChild>
      <Link to="/">
        <Home className="mr-2 size-4" />
        Back to home
      </Link>
    </Button>
  </main>
)
