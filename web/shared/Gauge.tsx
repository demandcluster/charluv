import { createSignal, Show } from 'solid-js'
import { Heart } from 'lucide-solid'

interface Props {
  currentXP: number
}
const baseXP = 30
const xpMultiplier = 1.1
const xpNeededForFirstLevel = 10

function calculateTotalXPNeededForLevel(level) {
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

const Gauge = (props: Props) => {
  const { currentXP, showBar } = props
  const xpNeeded = xpNeededForLevelUp(currentXP).xp
  const level = xpNeededForLevelUp(currentXP).lvl
  const levelXP = calculateTotalXPNeededForLevel(level)
  const percentFilled = Math.min((currentXP - levelXP) / xpNeeded, 1) * 100

  const [color, setColor] = createSignal('bg-red-500')

  const highbox = 25-Math.round(percentFilled /4);
  // Change the color based on the percentage filled
  if (percentFilled >= 50) {
    setColor('bg-red-500')
  } else if (percentFilled >= 25) {
    setColor('bg-yellow-500')
  } else {
    setColor('bg-green-500')
  }

  return(
    <>
      <div class="flex justify-between">
        <div class="text-base font-medium"> 
          <div><Heart class="absolute inline-block transform " /><Heart class="relative transform hearttest fill-red-600" viewBox={`0 ${highbox} 24 24`} style={`top: ${(highbox)}px`} /></div>
        </div>
      </div>
      <div class="-mt-2 -ml-2 text-[var(--hl-400)] font-bold">{level}</div>
      
      <Show when={showBar}>
        <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div class= {`bg-[var(--hl-900)] h-2.5 rounded-full` } style={`width: ${Math.round(percentFilled)}%`}></div>
        </div>
      </Show>
    </>
  )
}

export default Gauge