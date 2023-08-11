export type Flag = keyof typeof defaultFlags

export type FeatureFlags = typeof defaultFlags

export const defaultFlags = {
  chub: false,
  reporting: false,
  naiModel: false,
  actions: true,
  regen: true,
} satisfies { [key: string]: boolean }
