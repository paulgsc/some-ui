import type { FC } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "some-ui-utils"

type FramerToastProps = {
  title: string
  description: string
  showCloseIcone?: boolean
  className?: string
}

export const FramerToast: FC<FramerToastProps> = ({
  title,
  description,
  showCloseIcone = true,
  className,
}) => {
  return (
    <motion.div
      className={cn(
        "inset-shadow-sm z-50 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-100 p-4 shadow-md",
        className
      )}
      initial={{ opacity: 0, x: 50, y: 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 1,
      }}
      layout
    >
      <div className="flex-1">
        <h3 className="font-medium text-amber-800">{title}</h3>
        <p className="text-sm text-amber-700">{description}</p>
      </div>
      <button className="text-amber-500 hover:text-amber-700">
        {showCloseIcone && <X size={16} />}
      </button>
    </motion.div>
  )
}
