import { Component, JSX, createMemo, createSignal } from 'solid-js'
import { IconContext } from '/web/icons'

export type ButtonSchema = keyof typeof kinds

/** Icons inside a button inherit the button's text colour (not the global green
 * accent) so they stay visible on coloured/primary backgrounds. */
const ButtonIcons: Component<{ children: JSX.Element }> = (props) => (
  <IconContext.Provider
    value={{ color: 'currentColor', weight: 'duotone', size: '1em', mirrored: false }}
  >
    {props.children}
  </IconContext.Provider>
)

const kinds = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  grey: 'btn-secondary',
  gray: 'btn-secondary',
  clear: 'btn-clear',
  red: 'btn-red',
  error: 'btn-red',
  success: 'btn-green',
  green: 'btn-green',
  warning: 'btn-orange',
  hollow: 'btn-hollow',
  bordered: 'btn-bordered',
  icon: 'btn-icon',
  input: 'btn-input',
  none: '',
} satisfies { [key: string]: string }

const sizes = {
  sm: 'py-1 text-sm',
  md: 'py-2',
  lg: 'py-4 text-lg',
}

const Button: Component<{
  children: JSX.Element
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>
  schema?: ButtonSchema
  type?: 'submit' | 'reset' | 'button'
  size?: 'sm' | 'md' | 'lg' | 'pill'
  disabled?: boolean
  class?: string
  alignLeft?: boolean
  classList?: { [key: string]: boolean }
  ariaLabel?: string
}> = (props) => {
  const schema = createMemo(() => kinds[props.schema || 'primary'])
  return (
    <button
      type={props.type || 'button'}
      class={`select-none items-center ${props.class || ''}`}
      classList={{
        ...props.classList,
        [schema()]: true,
        'leading-5': props.size === 'pill',
        'py-0': props.size === 'pill',
        'py-1': props.size === 'sm',
        'py-2': !props.size || props.size === 'md',
        'py-4': props.size === 'lg',
        'text-sm': props.size === 'sm' || props.size === 'pill',
        'text-lg': props.size === 'lg',
        'justify-center': !props.alignLeft,
      }}
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props.ariaLabel}
    >
      <ButtonIcons>{props.children}</ButtonIcons>
    </button>
  )
}

export const LabelButton: Component<{
  children: JSX.Element
  for: string
  onClick?: JSX.EventHandler<HTMLLabelElement, MouseEvent>
  schema?: ButtonSchema
  type?: 'submit' | 'reset' | 'button'
  size?: 'sm' | 'md' | 'lg' | 'pill'
  disabled?: boolean
  class?: string
  alignLeft?: boolean
  classList?: { [key: string]: boolean }
}> = (props) => (
  <label
    for={props.for}
    class={`select-none items-center` + (props.class || '')}
    classList={{
      ...props.classList,
      [kinds[props.schema || 'primary']]: true,
      'leading-5': props.size === 'pill',
      'py-0': props.size === 'pill',
      'py-1': props.size === 'sm',
      'py-2': !props.size || props.size === 'md',
      'py-4': props.size === 'lg',
      'text-sm': props.size === 'sm' || props.size === 'pill',
      'text-lg': props.size === 'lg',
      'justify-center': !props.alignLeft,
    }}
    onClick={props.onClick}
  >
    <ButtonIcons>{props.children}</ButtonIcons>
  </label>
)

export const ToggleButton: Component<{
  fieldName: string
  children: JSX.Element
  onChange?: (value: boolean) => void
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  value?: boolean
  class?: string
  alignLeft?: boolean
}> = (props) => {
  let ref!: HTMLInputElement

  const [val, setVal] = createSignal(props.value ?? false)

  const onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (ev) => {
    const value = !ref.checked
    ref.checked = value
    setVal(value)
    props.onChange?.(value)
  }

  return (
    <>
      <button
        type="button"
        class={
          `${kinds.hollow} select-none items-center ${props.alignLeft ? '' : 'justify-center'} ${
            sizes[props.size || 'md']
          } ` + (props.class || '')
        }
        classList={{
          [kinds.hollow]: !val(),
          [kinds.success]: val(),
        }}
        disabled={props.disabled}
        onClick={onClick}
      >
        <ButtonIcons>{props.children}</ButtonIcons>
      </button>
      <input
        ref={(e) => (ref = e)}
        name={props.fieldName}
        type="checkbox"
        class="hidden"
        checked={props.value}
      />
    </>
  )
}

export default Button
