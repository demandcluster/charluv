import { AppSchema } from './types/schema'
import { claudePresets } from './presets/claude'
import { hordePresets } from './presets/horde'
import { koboldPresets } from './presets/kobold'
import { oobaPresets } from './presets/ooba'
import { openaiPresets } from './presets/openai'
import { charluvPresets } from './presets/charluv'

export const defaultPresets = {
  ...charluvPresets,
  ...hordePresets,
  ...koboldPresets,
  ...openaiPresets,
  ...claudePresets,
  ...oobaPresets,
} satisfies Record<string, Partial<AppSchema.GenSettings>>
