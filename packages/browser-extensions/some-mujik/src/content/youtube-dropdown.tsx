// src/content/YouTubeDropdown.tsx
import type { FC } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@mujik/components/ui/dropdown-menu"

type YouTubeDropdownProps = {
  onAction: (action: string) => void
}

export const YouTubeDropdown: FC<YouTubeDropdownProps> = ({ onAction }) => {
  const handleAction = (action: string) => {
    console.log(`Dropdown action triggered: ${action}`)
    onAction(action)
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: "8px",
        height: "36px",
      }}
    >
      <DropdownMenu
        trigger={
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 12px",
              height: "36px",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "18px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: "#0f0f0f",
              transition: "background-color 0.2s ease",
              fontFamily: "Roboto, Arial, sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f2f2f2"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
            }}
          >
            Track
          </button>
        }
      >
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleAction("save_session")}>
            Save Session
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("track_listen")}>
            Track Listen
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("log_timestamp")}>
            Log Timestamp
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("share_session")}>
            Share Session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
