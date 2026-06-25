import { Component, createEffect, splitProps, useContext } from 'solid-js'
import { IconContext } from 'phosphor-solid'
import type { IconProps } from 'phosphor-solid'
import svg from '../asset/MaskHappy.svg?raw'

/**
 * Phosphor's "mask-happy" (duotone) icon, vendored because phosphor-solid 1.1.5
 * (the latest published version) doesn't ship it — it only has FaceMask. This
 * reads the same `IconContext` the real Phosphor icons use, so it inherits
 * size/color/mirroring at every call site (e.g. the green 1.5rem in the menu).
 */
const MaskHappy: Component<IconProps> = (props) => {
  let host: HTMLSpanElement | undefined
  const ctx = useContext<Partial<IconProps>>(IconContext as any)
  const [, rest] = splitProps(props, [
    'color',
    'size',
    'weight',
    'mirrored',
    'class',
    'style',
    'ref',
    'children',
    'innerHTML',
  ])

  createEffect(() => {
    const el = host?.querySelector('svg')
    if (!el) return
    const size = String(props.size ?? ctx?.size ?? '1em')
    el.setAttribute('width', size)
    el.setAttribute('height', size)
    el.style.transform = props.mirrored ?? ctx?.mirrored ? 'scaleX(-1)' : ''
  })

  return (
    <span
      ref={(e) => (host = e)}
      class={props.class}
      // The SVG fills with currentColor, so driving the element's color sets
      // both duotone layers (the secondary keeps its 0.2 opacity).
      style={{
        color: (props.color ?? ctx?.color ?? 'currentColor') as string,
        display: 'inline-flex',
        'align-items': 'center',
        'line-height': '0',
      }}
      innerHTML={svg}
      {...(rest as Record<string, any>)}
    />
  )
}

export default MaskHappy
