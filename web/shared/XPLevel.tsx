const XPLevel = (xp: number) => {
  const baseXP = 30
  const xpMultiplier = 1.1
  const xpNeededForFirstLevel = 10

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
  const xpl = xpNeededForLevelUp(xp)
  return xpl.lvl
}

export default XPLevel
