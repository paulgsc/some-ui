import { useCallback, useEffect, useState } from "react"
import type { TradeData } from "@portfolio-chart/types/trade-data"

type Options = {
  data: Array<TradeData>
}

type ReturnOptions = {
  tradeData: Array<TradeData>
  currentIndex: number
  isPlaying: boolean
  totalGain: number
  playAnimation: () => void
  pauseAnimation: () => void
  resetAnimation: () => void
  nextTrade: () => void
  previousTrade: () => void
}

export function useTradeData({ data }: Options): ReturnOptions {
  const [tradeData, setTradeData] = useState<Array<TradeData>>(data)
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [totalGain, setTotalGain] = useState<number>(0)

  // Calculate total gain/loss based on current visible trades
  useEffect(() => {
    if (currentIndex >= 0) {
      const visibleTrades = tradeData.slice(0, currentIndex + 1)
      const total = visibleTrades.reduce((sum, trade) => sum + trade.value, 0)
      setTotalGain(total)
    } else {
      setTotalGain(0)
    }
  }, [tradeData, currentIndex])

  // Animation logic
  useEffect(() => {
    let animationTimer: ReturnType<typeof setTimeout>

    if (isPlaying && currentIndex < tradeData.length - 1) {
      animationTimer = setTimeout(() => {
        setCurrentIndex((prev) => prev + 1)
      }, 2000) // Show a new trade every 2 seconds
    } else if (isPlaying && currentIndex >= tradeData.length - 1) {
      setIsPlaying(false)
    }

    return (): void => {
      clearTimeout(animationTimer)
    }
  }, [isPlaying, currentIndex, tradeData.length])

  const playAnimation = useCallback(() => {
    if (currentIndex >= tradeData.length - 1) {
      setCurrentIndex(-1)
      setTimeout(() => {
        setIsPlaying(true)
      }, 300)
    } else {
      setIsPlaying(true)
    }
  }, [currentIndex, tradeData.length])

  const pauseAnimation = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const resetAnimation = useCallback(() => {
    setIsPlaying(false)
    setCurrentIndex(-1)
  }, [])

  const nextTrade = useCallback(() => {
    if (currentIndex < tradeData.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, tradeData.length])

  const previousTrade = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex])

  return {
    tradeData,
    currentIndex,
    isPlaying,
    totalGain,
    playAnimation,
    pauseAnimation,
    resetAnimation,
    nextTrade,
    previousTrade,
  }
}
