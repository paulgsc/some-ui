import type { PackageStatus, Repository } from "@resume/types/graveyard"
import { AlertTriangle, Clock, Flower, Leaf, Skull } from "lucide-react"

// Status definitions - Using 'as const' or specific keys ensures TS knows these exist
export const packageStatuses: Record<string, PackageStatus> = {
  flourishing: {
    name: "flourishing",
    icon: Flower,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100",
    borderColor: "border-emerald-200",
  },
  growing: {
    name: "growing",
    icon: Leaf,
    color: "text-green-500",
    bgColor: "bg-green-100",
    borderColor: "border-green-200",
  },
  stale: {
    name: "stale",
    icon: Clock,
    color: "text-amber-500",
    bgColor: "bg-amber-100",
    borderColor: "border-amber-200",
  },
  neglected: {
    name: "neglected",
    icon: AlertTriangle,
    color: "text-orange-500",
    bgColor: "bg-orange-100",
    borderColor: "border-orange-200",
  },
  abandoned: {
    name: "abandoned",
    icon: Skull,
    color: "text-red-500",
    bgColor: "bg-red-100",
    borderColor: "border-red-200",
  },
}

const randomDate = (): Date => {
  const now = new Date()
  const daysAgo = Math.floor(Math.random() * 60)
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return date
}

const getStatus = (lastActivity: Date): PackageStatus => {
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000)
  )

  if (diffDays < 3) return packageStatuses.flourishing!
  if (diffDays < 7) return packageStatuses.growing!
  if (diffDays < 14) return packageStatuses.stale!
  if (diffDays < 30) return packageStatuses.neglected!
  return packageStatuses.abandoned!
}

export const generateDummyData = (): Array<Repository> => {
  const repos = [
    { name: "main-monorepo", description: "Primary development workspace" },
    { name: "design-system", description: "UI components and design tokens" },
    { name: "api-services", description: "Backend API services and utilities" },
    { name: "experimental", description: "Experimental features and concepts" },
  ]

  return repos.map((repo) => {
    const packageCount = 5 + Math.floor(Math.random() * 10)
    const packages = Array.from({ length: packageCount }, (_, i) => {
      const lastActivity = randomDate()
      const status = getStatus(lastActivity)
      const commitCount = Math.floor(Math.random() * 100) + 1

      const repoName = repo.name
      const prefix = repoName.split("-")[0] ?? "pkg"
      const category = ["UI", "Core", "Utils", "API", "Data"][i % 5] ?? "Other"

      return {
        id: `${repoName}-pkg-${i}`,
        name: `${prefix}-package-${i + 1}`,
        description: `${category} package for ${repoName}`,
        lastActivity,
        status,
        commitCount,
        contributors: Math.floor(Math.random() * 5) + 1,
      }
    })

    return {
      ...repo,
      packages,
      expanded: true,
    }
  })
}
