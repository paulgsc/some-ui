// src/content/YouTubeDropdown.tsx
import React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@mujik/components/ui/dropdown-menu"
import { Clock, MoreHorizontal, Music, Save, Share2 } from "lucide-react"

type YouTubeDropdownProps = {
  onAction: (action: string) => void
}

export const YouTubeDropdown: React.FC<YouTubeDropdownProps> = ({
  onAction,
}) => {
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
            <MoreHorizontal size={18} style={{ marginRight: "6px" }} />
            Track
          </button>
        }
      >
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleAction("save_session")}>
            <Save size={16} style={{ marginRight: "8px" }} />
            Save Session
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("track_listen")}>
            <Music size={16} style={{ marginRight: "8px" }} />
            Track Listen
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("log_timestamp")}>
            <Clock size={16} style={{ marginRight: "8px" }} />
            Log Timestamp
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handleAction("share_session")}>
            <Share2 size={16} style={{ marginRight: "8px" }} />
            Share Session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
