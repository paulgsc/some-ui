import {
  ModernBuilding,
  OfficeBuilding,
  SteppedBuilding,
  StripedBuilding,
  Sun,
  TallBuilding,
} from "@makjang/components/shapes"

export const Skyline = (): React.JSX.Element => {
  return (
    <div className="relative h-[500px] w-full overflow-hidden bg-gradient-to-r from-green-100 via-yellow-100 to-blue-100">
      <Sun />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-4 px-8">
        <TallBuilding />
        <SteppedBuilding />
        <OfficeBuilding />
        <StripedBuilding />
        <ModernBuilding className="h-44" />
        <OfficeBuilding className="bg-pink-500" />
        <StripedBuilding className="bg-green-500" />
        <ModernBuilding />
        <TallBuilding className="bg-blue-500" />
        <OfficeBuilding className="bg-pink-300" />
      </div>
    </div>
  )
}
