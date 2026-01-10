import type {
  ApiAdapter,
  SatelliteDataItem,
} from "@nfl/types/hopium/hopium-tracker"

type MockSatelliteData = {
  dataType: string
  orbitAltitude: number
  signalStrength: number
  batteryLevel: number
  nextPass: number
}

export class MockSatelliteAdapter implements ApiAdapter<MockSatelliteData> {
  private generateMockItem = (
    id?: string
  ): SatelliteDataItem<MockSatelliteData> => {
    const dataTypes = [
      "Telemetry",
      "Imaging",
      "Navigation",
      "Weather",
      "Communications",
      "Radar",
      "GPS",
      "Thermal",
    ]
    const priorities: Array<"low" | "medium" | "high" | "critical"> = [
      "low",
      "medium",
      "high",
      "critical",
    ]
    const itemId = id || `sat-${Math.floor(Math.random() * 1000)}`

    return {
      id: itemId,
      name: `Satellite ${String.fromCharCode(65 + (Number.parseInt(itemId.split("-")[1]) % 26))}`,
      freshness: Math.floor(Math.random() * 100),
      lastUpdated: new Date(),
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      data: {
        dataType: dataTypes[Math.floor(Math.random() * dataTypes.length)],
        orbitAltitude: Math.floor(Math.random() * 500 + 400),
        signalStrength: Math.floor(Math.random() * 40 + 60),
        batteryLevel: Math.floor(Math.random() * 30 + 70),
        nextPass: Math.floor(Math.random() * 120 + 30),
      },
    }
  }

  async refreshItem(id: string): Promise<SatelliteDataItem<MockSatelliteData>> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error(`Failed to refresh satellite ${id}`)
    }

    const item = this.generateMockItem(id)
    item.freshness = 100 // Refreshed items are fully fresh
    return item
  }

  async refreshAll(): Promise<Array<SatelliteDataItem<MockSatelliteData>>> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return Array.from({ length: 50 }, (_, i) =>
      this.generateMockItem(`sat-${i + 1}`)
    )
  }
}
