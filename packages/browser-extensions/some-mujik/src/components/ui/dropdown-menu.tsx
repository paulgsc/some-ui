import * as React from "react"
import { cn } from "@mujik/lib/utils"

type DropdownMenuProps = {
  children: React.ReactNode
  trigger: React.ReactNode
}

type DropdownMenuContentProps = {
  children: React.ReactNode
  align?: "start" | "center" | "end"
}

type DropdownMenuItemProps = {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}

const DropdownMenuContext = React.createContext<{
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}>({
  isOpen: false,
  setIsOpen: () => {},
})

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  trigger,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <DropdownMenuContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export const DropdownMenuTrigger: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <>{children}</>
}

export const DropdownMenuContent: React.FC<DropdownMenuContentProps> = ({
  children,
  align = "start",
}) => {
  const { isOpen } = React.useContext(DropdownMenuContext)

  if (!isOpen) return null

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground absolute z-50 min-w-32 overflow-hidden rounded-md border p-1 shadow-md",
        align === "end" && "right-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "start" && "left-0"
      )}
      style={{
        top: "100%",
        marginTop: "4px",
        backgroundColor: "white",
        border: "1px solid #e2e8f0",
        boxShadow:
          "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      }}
    >
      {children}
    </div>
  )
}

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  children,
  onClick,
  disabled = false,
}) => {
  const { setIsOpen } = React.useContext(DropdownMenuContext)

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick()
      setIsOpen(false)
    }
  }

  return (
    <div
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
        disabled
          ? "pointer-events-none opacity-50"
          : "hover:bg-accent hover:text-accent-foreground cursor-pointer"
      )}
      onClick={handleClick}
      style={{
        fontSize: "14px",
        padding: "8px 12px",
        color: "#374151",
        borderRadius: "4px",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = "#f3f4f6"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
      }}
    >
      {children}
    </div>
  )
}
