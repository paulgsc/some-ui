import { useState } from "react"
import { Header } from "@resume/components/graveyard/header"
import { Legend } from "@resume/components/graveyard/legend"
import { RepositoryColumn } from "@resume/components/graveyard/repository-column"
import { generateDummyData } from "@resume/data/graveyard"
import type { Repository } from "@resume/types/graveyard"

export const PackageGarden = () => {
  const [repos, setRepos] = useState<Array<Repository>>(generateDummyData())
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"lastActivity" | "name">("lastActivity")

  const toggleRepo = (repoName: string) => {
    setRepos(
      repos.map((repo) =>
        repo.name === repoName ? { ...repo, expanded: !repo.expanded } : repo
      )
    )
  }

  const filteredRepos = repos
    .map((repo) => {
      const filteredPackages = repo.packages.filter(
        (pkg) =>
          pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pkg.description.toLowerCase().includes(searchQuery.toLowerCase())
      )

      return {
        ...repo,
        packages: filteredPackages,
      }
    })
    .filter((repo) => repo.packages.length > 0)

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-slate-50 p-4 dark:bg-slate-900">
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy as (sortBy: "lastActivity" | "name") => void}
      />

      <div className="grid h-full grid-cols-1 gap-4 overflow-hidden md:grid-cols-2 lg:grid-cols-4">
        {filteredRepos.map((repo) => (
          <RepositoryColumn
            key={repo.name}
            repo={repo}
            sortBy={sortBy}
            toggleRepo={toggleRepo}
          />
        ))}
      </div>

      <Legend repositories={repos} />
    </div>
  )
}
