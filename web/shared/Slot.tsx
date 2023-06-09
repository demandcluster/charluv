import { Component, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { AppSchema } from '/common/types'
import { settingStore, userStore } from '../store'
import { v4 } from 'uuid'

type SlotKind = Exclude<keyof Required<AppSchema.AppConfig['slots']>, 'testing'>

const Slot: Component<{ slot: SlotKind; stick?: boolean }> = (props) => {
  let ref: HTMLDivElement | undefined = undefined
  const user = userStore()

  const [show, setShow] = createSignal(false)
  const [stick, setStick] = createSignal(props.stick)
  const [id] = createSignal(v4())
  const [done, setDone] = createSignal(false)

  const cfg = settingStore((s) => ({
    slots: s.config.slots,
    flags: s.flags,
    ready: s.initLoading === false,
  }))

  const hidden = createMemo(() => (show() ? '' : 'hidden'))

  const log = (...args: any[]) => {
    if (!user.user?.admin) return
    console.log.apply(null, [`[${props.slot}]`, ...args, { show: show(), done: done() }])
  }

  createEffect(() => {
    if (!cfg.ready) return

    /**
     * Display when slot is configured and any of:
     * 1. Feature flag is enabled
     * 2. or 'testing' is true and user is admin
     * 3. Env var is enabled
     */
    const hasSlot = !!cfg.slots[props.slot]
    if (!hasSlot) {
      log('Missing slot')
    }
    const canShow =
      hasSlot &&
      (cfg.flags.slots || cfg.slots.enabled) &&
      !user.user?.premium &&
      user.user?._id !== 'anon'
    setShow(canShow)
    const ele = document.getElementById(id()) || ref
    if (!ele) {
      log(props.slot, 'No element')
      return
    }

    if (canShow) {
      if (done()) {
        return
      }

      const node = document.createRange().createContextualFragment(cfg.slots[props.slot] as any)
      ele.append(node)
      setDone(true)
      log('Rendered')

      setTimeout(() => {
        setStick(false)
      }, 4000)
    } else {
      ele.innerHTML = ''
    }
  })

  return (
    <>
      <Show when={stick()}>
        <div class="sticky top-0 z-10">
          <div
            class={hidden()}
            ref={ref}
            id={id()}
            data-slot={props.slot}
            style={stick() ? { position: 'sticky', top: 0 } : {}}
            classList={{
              'border-[var(--bg-700)]': !!user.user?.admin,
              'bg-[var(--text-200)]': !!user.user?.admin,
              'border-[1px]': !!user.user?.admin,
            }}
          ></div>
        </div>
      </Show>
      <Show when={!stick()}>
        <div
          class={hidden()}
          ref={ref}
          id={id()}
          data-slot={props.slot}
          style={stick() ? { position: 'sticky', top: 0 } : {}}
          classList={{
            'border-[var(--bg-700)]': !!user.user?.admin,
            'bg-[var(--text-200)]': !!user.user?.admin,
            'border-[1px]': !!user.user?.admin,
          }}
        ></div>
      </Show>
    </>
  )
}

export default Slot
