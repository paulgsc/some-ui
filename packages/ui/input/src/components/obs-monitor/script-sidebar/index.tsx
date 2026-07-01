import type { JSX } from "react"
import { useState } from "react"
import {
  Clock,
  FileText,
  Folder,
  Layers,
  MoreVertical,
  Play,
  Plus,
  Search,
} from "lucide-react"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
} from "some-ui-shared"

type ScriptSidebarProps = {
  selectedScript: string | null
  onScriptSelect: (scriptId: string) => void
}

export const ScriptSidebar = ({
  selectedScript,
  onScriptSelect,
}: ScriptSidebarProps): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState("")

  // Mock script data
  const scripts = [
    {
      id: "1",
      name: "Morning Show Intro",
      duration: "2:30",
      events: 12,
      status: "ready",
      lastModified: "2 hours ago",
    },
    {
      id: "2",
      name: "Product Demo",
      duration: "5:45",
      events: 28,
      status: "draft",
      lastModified: "1 day ago",
    },
    {
      id: "3",
      name: "Closing Sequence",
      duration: "1:15",
      events: 8,
      status: "ready",
      lastModified: "3 days ago",
    },
  ]

  const filteredScripts = scripts.filter((script) =>
    script.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="border-border bg-sidebar flex w-80 flex-col border-r">
      {/* Header */}
      <div className="border-sidebar-border border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sidebar-foreground font-semibold">Scripts</h2>
          <Button size="sm" className="size-8 p-0">
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2 transform" />
          <Input
            placeholder="Search scripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-9"
          />
        </div>
      </div>

      {/* Script List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredScripts.map((script) => (
            <div
              key={script.id}
              className={`mb-2 cursor-pointer rounded-lg p-3 transition-colors ${
                selectedScript === script.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-primary"
              }`}
              onClick={() => onScriptSelect(script.id)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <FileText className="text-muted-foreground size-4 flex-shrink-0" />
                    <h3 className="truncate text-sm font-medium">
                      {script.name}
                    </h3>
                  </div>

                  <div className="text-muted-foreground mb-2 flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {script.duration}
                    </div>
                    <div className="flex items-center gap-1">
                      <Layers className="size-3" />
                      {script.events} events
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        script.status === "ready" ? "secondary" : "outline"
                      }
                      className="text-xs"
                    >
                      {script.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {script.lastModified}
                    </span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 size-6 p-0"
                    >
                      <MoreVertical className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Play className="mr-2 size-4" />
                      Run Script
                    </DropdownMenuItem>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem>Export</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      <div className="border-sidebar-border border-t p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent text-xs"
          >
            <Folder className="mr-1 size-3" />
            New Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent text-xs"
          >
            <FileText className="mr-1 size-3" />
            New Script
          </Button>
        </div>
      </div>
    </div>
  )
}
