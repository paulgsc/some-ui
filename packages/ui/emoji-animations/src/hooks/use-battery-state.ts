import { useEffect, useState } from "react"

export const useBatteryState = (initialCharge = 100, dischargeRate = 1) => {
  const [charge, setCharge] = useState(initialCharge)
  const [isCharging, setIsCharging] = useState(false)

  useEffect(() => {
    const intervalTime = (100 / 60) * 60000
    const interval = setInterval(() => {
      if (!isCharging && charge > 0) {
        setCharge((prevCharge) => Math.max(prevCharge - dischargeRate, 0))
      } else if (isCharging && charge < 100) {
        setCharge((prevCharge) => Math.min(prevCharge + dischargeRate, 100))
      }
    }, intervalTime)

    return (): void => {
      clearInterval(interval)
    }
  }, [charge, isCharging, dischargeRate])

  const toggleCharging = (): void => {
    setIsCharging(!isCharging)
  }

  return { charge, isCharging, toggleCharging }
}
