import type { FC } from "react"
import { motion } from "framer-motion"

type BatteryIndicatorProps = {
  charge: number
  isCharging: boolean
}

const BatteryIndicator: FC<BatteryIndicatorProps> = ({
  charge,
  isCharging,
}) => {
  return (
    <div className="relative h-8 w-16 overflow-hidden rounded-md border-2 border-gray-400">
      <motion.div
        className="absolute inset-y-0 left-0 bg-green-500"
        initial={{ width: "100%" }}
        animate={{ width: `${charge}%` }}
        transition={{ type: "spring", stiffness: 50 }}
      />
      {isCharging && (
        <motion.div
          className="absolute inset-0 bg-yellow-300 opacity-50"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
        {charge}%
      </div>
      <div className="absolute -right-2 top-1/2 h-4 w-2 -translate-y-1/2 transform rounded-r-md bg-gray-400" />
    </div>
  )
}

export default BatteryIndicator
