import type { FC } from "react"
import BatteryIndicator from "@emoji/components/battery-indicator"
import BoredEmoji from "@emoji/components/bored-emoji"
import { useBatteryState } from "@emoji/hooks/use-battery-state"
import { motion } from "framer-motion"
import { cn } from "some-ui-utils"

type BoredAnimationProps = {
  className?: string
}

const BoredAnimation: FC<BoredAnimationProps> = ({ className }) => {
  const { charge, isCharging, toggleCharging, delCharge } = useBatteryState()

  // Calculate derived state directly during render
  const isSleeping = charge === 0

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        className
      )}
    >
      <motion.div
        className=""
        animate={{ rotate: isSleeping ? [0, -5, 5, -5, 5, 0] : 0 }}
        transition={{ repeat: Infinity, duration: 2, repeatType: "loop" }}
      >
        <BoredEmoji isSleeping={isSleeping} />
      </motion.div>
      <BatteryIndicator charge={charge} isCharging={isCharging} />
      <button
        className="size-fit max-w-24 rounded bg-purple-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 group-hover:block group-focus:block"
        onClick={charge > 0 ? toggleCharging : delCharge}
      >
        {isCharging ? (
          "Charging!"
        ) : (
          <p className="size-full shrink-0 text-center text-sm capitalize tracking-tight">
            <span className="group-hover:hidden group-focus:hidden">
              motivation
            </span>
            <span className="hidden group-hover:block group-focus:block">
              Charge
            </span>
          </p>
        )}
      </button>
    </div>
  )
}

export default BoredAnimation
