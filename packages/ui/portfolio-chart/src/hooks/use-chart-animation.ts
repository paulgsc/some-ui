import { useEffect, useState } from "react"

export function useChartAnimation(currentIndex: number, totalTrades: number) {
  const [chartOpacity, setChartOpacity] = useState<number>(1)

  // Adjust chart opacity based on whether a trade is selected
  useEffect(() => {
    if (currentIndex >= 0) {
      setChartOpacity(0.7) // Reduce opacity when showing trade info
    } else {
      setChartOpacity(1)
    }
  }, [currentIndex])

  return { chartOpacity }
}
