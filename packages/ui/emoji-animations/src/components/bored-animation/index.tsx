import { useEffect, useState } from "react"
import type { FC } from "react"
import { BatteryIndicator } from "@emoji/battery-indicator"
import { BoredEmoji } from "@emoji/bored-emoji"
import { useBatteryState } from "@emoji/hooks/use-battery-state"
import { motion } from "framer-motion"

const BoredAnimation: FC = () => {
  const { charge, isCharging, toggleCharging } = useBatteryState()
  const [isSleeping, setIsSleeping] = useState(false)

  useEffect(() => {
    setIsSleeping(charge === 0)
  }, [charge])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100">
      <motion.div
        className="mb-8"
        animate={{ rotate: isSleeping ? [0, -5, 5, -5, 5, 0] : 0 }}
        transition={{ repeat: Infinity, duration: 2, repeatType: "loop" }}
      >
        <BoredEmoji isSleeping={isSleeping} />
      </motion.div>
      <BatteryIndicator charge={charge} isCharging={isCharging} />
      <button
        className="mt-4 rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
        onClick={toggleCharging}
      >
        {isCharging ? "Unplug" : "Charge"}
      </button>
    </div>
  )
}

export default BoredAnimation
