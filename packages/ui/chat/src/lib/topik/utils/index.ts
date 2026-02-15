import type { TopikMetadata } from "@chat/lib/topik"

export function getRecommendedItems(
  items: Array<TopikMetadata>,
  count = 6
): Array<TopikMetadata> {
  return [...items]
    .filter((item) => item.batchCount > 0)
    .sort((a, b) => {
      if (b.batchCount !== a.batchCount) return b.batchCount - a.batchCount
      return b.totalQuestions - a.totalQuestions
    })
    .slice(0, count)
}
