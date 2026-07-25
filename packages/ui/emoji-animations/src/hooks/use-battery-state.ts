import { useEffect, useRef, useState } from "react"
import { useLocalStorage } from "some-ui-utils"

//TODO: Use fucntional types to manage all state: future goal!.

type UseBatteryStateType = {
  chargeKey?: string
  charge: number
  isCharging: boolean
  toggleCharging: () => void
  delCharge: () => void
}

export const useBatteryState = (
  chargeKey = "bored-meter",
  initialCharge = 100,
  dischargeRate = 1
): UseBatteryStateType => {
  const {
    value: charge,
    setValue: setCharge,
    removeValue: delCharge,
  } = useLocalStorage(chargeKey, initialCharge)
  const [isCharging, setIsCharging] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    const intervalTime = (100 / 60) * 60000
    intervalRef.current = setInterval(() => {
      if (!isCharging && charge > 0) {
        setCharge((prevCharge) => Math.max(prevCharge - dischargeRate, 0))
      } else if (isCharging && charge < 100) {
        setCharge((prevCharge) => Math.min(prevCharge + dischargeRate, 100))
      }
    }, intervalTime)

    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [charge, setCharge, isCharging, dischargeRate])

  const toggleCharging = (): void => {
    setIsCharging(!isCharging)
  }

  return { charge, isCharging, delCharge, toggleCharging }
}
