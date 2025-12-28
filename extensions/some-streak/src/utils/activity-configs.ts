/**
 * Activity Tracker Configurations
 * Define auto-completion rules for different categories
 */

import type { ActivityConfig } from "./activity-tracker"

/**
 * All activity tracking configurations
 */
export const ACTIVITY_CONFIGS: Array<ActivityConfig> = [
  {
    domain: "play.typeracer.com",
    durationMs: 10 * 60 * 1000, // 10 minutes
    categoryId: "typing",
    taskId: "1",
  },
  // Add more configs here as needed:
  // {
  //   domain: "leetcode.com",
  //   path: "/problems/",
  //   durationMs: 30 * 60 * 1000, // 30 minutes
  //   categoryId: "leetcode",
  //   taskId: "1",
  // },
]

/**
 * Get config matching the current page
 */
export function getMatchingConfig(): ActivityConfig | null {
  const currentDomain = window.location.hostname
  const currentPath = window.location.pathname

  return (
    ACTIVITY_CONFIGS.find((config) => {
      if (!currentDomain.includes(config.domain)) {
        return false
      }

      if (config.path && !currentPath.includes(config.path)) {
        return false
      }

      return true
    }) || null
  )
}
