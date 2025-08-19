import { cn } from "@mujik/lib/utils"

type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "focus-visible:ring-ring focus-visible:ring-offset-background peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input"
      )}
      disabled={disabled}
      style={{
        backgroundColor: checked ? "#3b82f6" : "#e5e7eb",
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        position: "relative",
        border: "none",
        outline: "none",
      }}
    >
      <span
        className={cn(
          "bg-background pointer-events-none block size-5 rounded-full shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
        style={{
          backgroundColor: "white",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          position: "absolute",
          top: "2px",
          left: checked ? "22px" : "2px",
          transition: "left 0.2s ease-in-out",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  )
}
