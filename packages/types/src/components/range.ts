export type Range<
  N extends number,
  Acc extends Array<number> = [],
> = Acc["length"] extends N ? Acc[number] : Range<N, [...Acc, Acc["length"]]>
