type SourceType =
  | "Book"
  | "Website"
  | "Data"
  | "Document"
  | "SatelliteData"
  | "Image"
  | "Music"
  | "Video"
  | "Code"
export type Attribution = {
  sourceType: SourceType
  title: string
  author: string
  url?: string
  license: string
  thankYouMessage: string
  thumbnail?: string
}
