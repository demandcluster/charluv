const XPLevel = (xp: number) => {
  const baseXP = 30
  const xpMultiplier = 1.1
  const xpNeededForFirstLevel = 10

  function calculateTotalXPNeededForLevel(level: number) {
    if (level === 0) {
      return xpNeededForFirstLevel
    } else {
      return (
        Math.floor(baseXP * Math.pow(xpMultiplier, level - 1)) +
        calculateTotalXPNeededForLevel(level - 1)
      )
    }
  }

  function xpNeededForLevelUp(currentXP: number) {
    let xpNeededForNextLevel = xpNeededForFirstLevel
    let currentLevel = 1

    while (currentXP >= xpNeededForNextLevel) {
      xpNeededForNextLevel = Math.floor(baseXP * xpMultiplier ** (currentLevel - 1))
      currentXP -= xpNeededForNextLevel
      currentLevel++
    }
    return { xp: xpNeededForNextLevel - currentXP, lvl: currentLevel - 1 }
  }
  xpl = xpNeededForLevelUp(xp)
  return xpl.lvl
}

export default XPLevel
