const XPLevel = (xp: number) => {
  const baseXP = 30
  const xpMultiplier = 1.1
  const xpNeededForFirstLevel = 10

  function xpNeededForLevelUp(currentXP: number): number {
    let xpNeededForNextLevel = xpNeededForFirstLevel
    let currentLevel = 1

    while (currentXP >= xpNeededForNextLevel) {
      xpNeededForNextLevel = Math.floor(baseXP * xpMultiplier ** (currentLevel - 1))
      currentXP -= xpNeededForNextLevel
      currentLevel++
    }
    return currentLevel - 1
  }
  const xpl = xpNeededForLevelUp(xp)
  return xpl
}

/** Canonical level-from-XP. Use this everywhere instead of the duplicated web-side impls. */
export const getCharacterLevel = (xp: number = 0) => XPLevel(xp || 0)

export default XPLevel
