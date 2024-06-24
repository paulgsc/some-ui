import type { EmblaCarouselType } from './EmblaCarousel'
import type { CreateOptionsType, LooseOptionsType } from './Options'
import type { OptionsHandlerType } from './OptionsHandler'

export type LoosePluginType = Record<string, unknown>

export type CreatePluginType<
  TypeA extends LoosePluginType,
  TypeB extends LooseOptionsType
> = TypeA & {
  name: string
  options: Partial<CreateOptionsType<TypeB>>
  init: (embla: EmblaCarouselType, OptionsHandler: OptionsHandlerType) => void
  destroy: () => void
}

export type EmblaPluginsType = Record<
  string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  CreatePluginType<LoosePluginType, {}>
>

export type EmblaPluginType = EmblaPluginsType[keyof EmblaPluginsType]
