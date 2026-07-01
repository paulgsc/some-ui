import { useEffect, useState } from "react"

export const useActiveIndices = (
  totalCount: number,
  activeCount: number
): Set<number> => {
  const [activeIndices, setActiveIndices] = useState<Set<number>>(new Set())

  useEffect(() => {
    const updateActiveIndices = (): void => {
      const newActiveIndices = new Set<number>()
      for (let i = 0; i < activeCount; i++) {
        newActiveIndices.add(Math.floor(Math.random() * totalCount))
      }
      setActiveIndices(newActiveIndices)
    }

    const flickerInterval = setInterval(updateActiveIndices, 50)
    return (): void => clearInterval(flickerInterval)
  }, [totalCount, activeCount])

  return activeIndices
}
