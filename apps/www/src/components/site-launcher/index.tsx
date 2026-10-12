import type { JSX } from "react"
import { useState } from "react"
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { LayoutGrid, Lock } from "lucide-react"

import { useAuthority } from "@/lib/authority"
import { destinationsHere, type DestinationGroup } from "@/lib/site-map"

const GROUPS: ReadonlyArray<{ key: DestinationGroup; title: string }> = [
  { key: "home-network", title: "Home network" },
  { key: "showcase", title: "Around the site" },
]

/**
 * The way to the pages the sidebar does not hold (`lib/site-map`): a grid
 * of tiles behind one header button, so they are a click away from every
 * dashboard page without lengthening the navigation. A LAN tool says when
 * it needs a passkey first, since its route sends a signed-out visit to sign
 * in. Nothing renders where the build serves none of them.
 */
export const SiteLauncher = (): JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const { kind } = useAuthority()
  const destinations = destinationsHere()
  if (destinations.length === 0) return null

  const groups = GROUPS.map((group) => ({
    ...group,
    items: destinations.filter((d) => d.group === group.key),
  })).filter((group) => group.items.length > 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <LayoutGrid className="size-4" aria-hidden />
          <span className="hidden sm:inline">Explore</span>
          <span className="sr-only sm:hidden">Explore the site</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] space-y-4 p-3"
      >
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
              {group.title}
            </h2>
            <ul className="grid grid-cols-2 gap-2">
              {group.items.map((d, i) => {
                const Icon = d.icon
                const locked = d.audience === "lan" && kind !== "account"
                return (
                  // An odd group leads with a wide tile, so no row is half empty.
                  <li
                    key={d.to}
                    className={
                      i === 0 && group.items.length % 2 === 1
                        ? "col-span-2"
                        : undefined
                    }
                  >
                    <Link
                      to={d.to}
                      onClick={() => setOpen(false)}
                      className="hover:bg-accent hover:border-primary/40 focus-visible:ring-ring flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span className="flex items-center justify-between">
                        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        {locked && (
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                            <Lock className="size-3" aria-hidden />
                            Passkey
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium">{d.title}</span>
                      <span className="text-muted-foreground text-xs leading-snug">
                        {d.blurb}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </PopoverContent>
    </Popover>
  )
}
