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
  const { currentXP } = props
  const xpNeeded = xpNeededForLevelUp(currentXP).xp
  const level = xpNeededForLevelUp(currentXP).lvl
  const levelXP = calculateTotalXPNeededForLevel(level)
  const percentFilled = Math.min((currentXP - levelXP) / xpNeeded, 1) * 100

  const [color, setColor] = createSignal('bg-red-500')

  // Change the color based on the percentage filled
  if (percentFilled >= 50) {
    setColor('bg-red-500')
  } else if (percentFilled >= 25) {
    setColor('bg-yellow-500')
  } else {
    setColor('bg-green-500')
  }

  return (
    <>
      <Show when={currentXP > 10}>
        <div class="flex">
          <div class="relative my-auto h-7 w-6 overflow-hidden rounded-full bg-gray-300">
            <div
              class={`absolute bottom-0 w-full bg-red-500`}
              style={{ height: `${percentFilled}%` }}
            >
              <Heart class="absolute  bottom-0 left-1/2 -translate-x-1/2 transform text-white" />
            </div>
          </div>
          <div class="m-2 text-2xl text-teal-300 opacity-60">{level}</div>
        </div>
      </Show>
    </>
  )
}

export default Gauge
