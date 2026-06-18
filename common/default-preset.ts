import { AppSchema } from './types/schema'
import { claudePresets } from './presets/claude'
import { hordePresets } from './presets/horde'
import { koboldPresets } from './presets/kobold'
import { oobaPresets } from './presets/ooba'
import { openaiPresets } from './presets/openai'
import { agnaiPresets } from './presets/agnaistic'

export const defaultPresets = {
  ...agnaiPresets,
  ...hordePresets,
  ...koboldPresets,
  ...openaiPresets,
  ...claudePresets,
  ...oobaPresets,
} satisfies Record<string, Partial<AppSchema.GenSettings>>
