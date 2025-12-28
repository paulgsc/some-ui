import { PackageCard } from "@resume/components/graveyard/package-card"
import type { Repository } from "@resume/types/graveyard"
import { ChevronDown, ChevronUp, Package } from "lucide-react"
import { Badge, Button, Marquee } from "some-ui-shared"

type RepositoryColumnProps = {
  repo: Repository
  sortBy: "lastActivity" | "name"
  toggleRepo: (repoName: string) => void
}

export const RepositoryColumn = ({
  repo,
  sortBy,
  toggleRepo,
}: RepositoryColumnProps) => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="flex cursor-pointer items-center justify-between rounded-t-lg bg-slate-100 p-2 dark:bg-slate-800"
        onClick={() => toggleRepo(repo.name)}
      >
        <div className="flex items-center gap-2">
          <Package className="size-4" />
          <h2 className="font-semibold">{repo.name}</h2>
          <Badge variant="outline">{repo.packages.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="size-6 p-0">
          {repo.expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </div>

      {repo.expanded && (
        <Marquee pauseOnHover className="[--duration:20s]" vertical={true}>
          {repo.packages
            .sort((a, b) => {
              if (sortBy === "lastActivity") {
                return b.lastActivity.getTime() - a.lastActivity.getTime()
              }
              return a.name.localeCompare(b.name)
            })
            .map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
        </Marquee>
      )}
    </div>
  )
}
