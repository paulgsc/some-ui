import { Activity } from "lucide-react"
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "some-ui-shared"

type SortButtonProps = {
  sortBy: "lastActivity" | "name"
  setSortBy: (sortBy: "lastActivity" | "name") => void
}

export const SortButton = ({ sortBy, setSortBy }: SortButtonProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setSortBy(sortBy === "lastActivity" ? "name" : "lastActivity")
            }
          >
            <Activity className="mr-1 size-4" />
            {sortBy === "lastActivity" ? "By Activity" : "By Name"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Toggle sort order</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
