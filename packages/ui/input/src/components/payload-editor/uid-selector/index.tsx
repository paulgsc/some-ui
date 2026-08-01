import type { JSX } from "react"
import { useState } from "react"
import type { ExistingChapter } from "@input/types/timeline-events"
import {
  generateUID,
  getChapterByUID,
  searchExistingChapters,
} from "@input/utils/event-helpers"
import { Check, ChevronDown, Clock, Hash, Search } from "lucide-react"
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@some-ui/shared"
import { cn } from "some-ui-utils"

type UIDSelectorProps = {
  value: string
  onChange: (value: string) => void
  show: boolean
}

const MODES = ["search", "manual"] as const
type Mode = (typeof MODES)[number]
const isMode = (value: string): value is Mode =>
  MODES.some((mode) => mode === value)

export const UIDSelector = ({
  value,
  onChange,
  show,
}: UIDSelectorProps): JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [mode, setMode] = useState<Mode>("search")

  if (!show) return null

  const searchResults = searchExistingChapters(searchQuery)
  const selectedChapter = getChapterByUID(value)

  const handleSelectChapter = (chapter: ExistingChapter): void => {
    onChange(chapter.uid)
    setOpen(false)
    setSearchQuery("")
  }

  const handleModeChange = (value: string): void => {
    if (isMode(value)) {
      setMode(value)
    }
  }

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (start: number, end?: number): string => {
    if (!end) return "Active"
    const duration = Math.round((end - start) / 1000)
    return `${duration}s`
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="uid">Chapter UID</Label>

      <Tabs value={mode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="search" className="gap-2">
            <Search className="size-4" />
            Search Existing
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Hash className="size-4" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between bg-transparent"
              >
                {selectedChapter ? (
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-sm">
                      {selectedChapter.uid}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="truncate">{selectedChapter.title}</span>
                  </div>
                ) : (
                  "Search for existing chapter..."
                )}
                <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search by UID, title, or tags..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No chapters found.</CommandEmpty>
                  <CommandGroup>
                    {searchResults.map((chapter) => (
                      <CommandItem
                        key={chapter.uid}
                        value={chapter.uid}
                        onSelect={() => handleSelectChapter(chapter)}
                        className="flex flex-col items-start gap-2 p-3"
                      >
                        <div className="flex w-full items-center gap-2">
                          <Check
                            className={cn(
                              "size-4",
                              value === chapter.uid
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <code className="bg-muted rounded px-1 font-mono text-sm">
                                {chapter.uid}
                              </code>
                              {chapter.is_active && (
                                <Badge variant="default" className="text-xs">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 truncate text-sm font-medium">
                              {chapter.title}
                            </div>
                          </div>
                        </div>

                        <div className="w-full space-y-1 pl-6">
                          <div className="text-muted-foreground flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatTimestamp(chapter.start_time)}
                            </div>
                            <div>
                              Duration:{" "}
                              {formatDuration(
                                chapter.start_time,
                                chapter.end_time
                              )}
                            </div>
                          </div>

                          {Object.keys(chapter.tags).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(chapter.tags).map(
                                ([key, tagValue]) => (
                                  <Badge
                                    key={key}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {key}: {tagValue}
                                  </Badge>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedChapter && (
            <div className="bg-muted space-y-2 rounded-md p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Selected Chapter</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange("")}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
              </div>
              <div className="space-y-1 text-sm">
                <div>
                  <strong>UID:</strong>{" "}
                  <code className="bg-background rounded px-1">
                    {selectedChapter.uid}
                  </code>
                </div>
                <div>
                  <strong>Title:</strong> {selectedChapter.title}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  {selectedChapter.is_active ? "Active" : "Completed"}
                </div>
                <div>
                  <strong>Started:</strong>{" "}
                  {formatTimestamp(selectedChapter.start_time)}
                </div>
                {selectedChapter.end_time && (
                  <div>
                    <strong>Ended:</strong>{" "}
                    {formatTimestamp(selectedChapter.end_time)}
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual" className="space-y-3">
          <div className="flex gap-2">
            <Input
              id="uid"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Enter chapter UID manually"
              className="font-mono"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => onChange(generateUID())}
            >
              <Hash className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Enter a custom UID or click the hash button to auto-generate a new
            one
          </p>
        </TabsContent>
      </Tabs>

      {value && !selectedChapter && mode === "search" && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2">
          <p className="text-xs text-yellow-800">
            {`UID "${value}" not found in existing chapters. This will create a new chapter.`}
          </p>
        </div>
      )}
    </div>
  )
}
