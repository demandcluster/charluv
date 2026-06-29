import { Component } from 'solid-js'
import { Coins } from '/web/icons'

/**
 * Inline coin + credit cost, for placing on (or beside) any button that charges
 * credits — keeps the "this costs N" signal visually consistent everywhere.
 */
const CreditCost: Component<{ amount: number; size?: number; class?: string }> = (props) => (
  <span
    class={`inline-flex items-center gap-1 whitespace-nowrap ${props.class || ''}`}
    aria-label={`Costs ${props.amount} credits`}
  >
    <Coins size={props.size ?? 14} class="text-yellow-500" aria-hidden="true" />
    {props.amount}
  </span>
)

export default CreditCost
