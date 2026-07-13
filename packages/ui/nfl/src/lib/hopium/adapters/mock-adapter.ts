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

    const itemId = id ?? `sat-${Math.floor(Math.random() * 1000)}`

    const idSuffix = itemId.split("-")[1] ?? "0"
    const nameChar = String.fromCharCode(
      65 + (Number.parseInt(idSuffix, 10) % 26)
    )

    const priority =
      priorities[Math.floor(Math.random() * priorities.length)] ?? "medium"
    const dataType =
      dataTypes[Math.floor(Math.random() * dataTypes.length)] ?? "Telemetry"

    return {
      id: itemId,
      name: `Satellite ${nameChar}`,
      freshness: Math.floor(Math.random() * 100),
      lastUpdated: new Date(),
      priority: priority, // Now guaranteed to be a valid Priority
      data: {
        dataType: dataType, // Now guaranteed to be a string
        orbitAltitude: Math.floor(Math.random() * 500 + 400),
        signalStrength: Math.floor(Math.random() * 40 + 60),
        batteryLevel: Math.floor(Math.random() * 30 + 70),
        nextPass: Math.floor(Math.random() * 120 + 30),
      },
    }
  }

  async refreshItem(id: string): Promise<SatelliteDataItem<MockSatelliteData>> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (Math.random() < 0.1) {
      throw new Error(`Failed to refresh satellite ${id}`)
    }

    const item = this.generateMockItem(id)
    item.freshness = 100
    return item
  }

  async refreshAll(): Promise<Array<SatelliteDataItem<MockSatelliteData>>> {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return Array.from({ length: 50 }, (_, i) =>
      this.generateMockItem(`sat-${i + 1}`)
    )
  }
}
