export type Flag = keyof typeof defaultFlags

export type FeatureFlags = typeof defaultFlags

export const defaultFlags = {
  reporting: false,
  naiModel: false,
  actions: false,
  regen: false,
  caption: false,
  debug: false,
  folders: true,
  sounds: false,
  google: false,
} satisfies { [key: string]: boolean }
