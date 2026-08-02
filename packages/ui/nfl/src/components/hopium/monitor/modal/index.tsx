import type { JSX } from "react"
import type { SatelliteDataItem } from "@nfl/types/hopium/hopium-tracker"
import { getFreshnessStatus } from "@nfl/utils/hopium/monitor-utils"
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Progress,
} from "@some-ui/shared"
import { RefreshCw } from "lucide-react"

type SatelliteDetails = {
  dataType?: string
  orbitAltitude?: number
  signalStrength?: number
  batteryLevel?: number
  nextPass?: number
}

type DetailModalProps<T> = {
  item: SatelliteDataItem<T> | null
  isOpen: boolean
  onClose: () => void
  onRefresh: (id: string) => void
}

const isSatelliteDetails = (data: unknown): data is SatelliteDetails => {
  return typeof data === "object" && data !== null
}

export const DetailModal = <T,>({
  item,
  isOpen,
  onClose,
  onRefresh,
}: DetailModalProps<T>): JSX.Element | null => {
  if (!item) return null

  const mockData = isSatelliteDetails(item.data) ? item.data : null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="font-serif">{item.name}</span>
            <Badge variant={getFreshnessStatus(item.freshness).variant}>
              {getFreshnessStatus(item.freshness).label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Detailed Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="mb-2 font-semibold">Data Freshness</h3>
              <div className="space-y-2">
                <Progress value={item.freshness} className="h-3" />
                <p className="text-2xl font-bold">
                  {Math.round(item.freshness)}%
                </p>
                <p className="text-muted-foreground text-sm">
                  Last updated: {item.lastUpdated.toLocaleString()}
                </p>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="mb-2 font-semibold">Priority Level</h3>
              <Badge
                variant={
                  item.priority === "critical" ? "destructive" : "outline"
                }
                className="mb-2 text-lg capitalize"
              >
                {item.priority}
              </Badge>
              <p className="text-muted-foreground text-sm">
                Data Type: {mockData?.dataType || "Unknown"}
              </p>
            </Card>
          </div>

          {/* Satellite Details */}
          {mockData?.orbitAltitude && (
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Satellite Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Orbit Altitude</p>
                  <p className="font-medium">{mockData.orbitAltitude} km</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Signal Strength</p>
                  <p className="font-medium">{mockData.signalStrength} dBm</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Battery Level</p>
                  <p className="font-medium">{mockData.batteryLevel}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Next Pass</p>
                  <p className="font-medium">{mockData.nextPass} min</p>
                </div>
              </div>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                onRefresh(item.id)
                onClose()
              }}
              className="flex-1"
            >
              <RefreshCw className="mr-2 size-4" />
              Update Data
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
