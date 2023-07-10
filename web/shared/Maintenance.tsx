import { Component, createSignal } from 'solid-js'
import { settingStore } from '../store'
import Modal from './Modal'

const Maintenance: Component = () => {
  const state = settingStore((s) => ({ init: s.init, loading: s.initLoading }))
  const [show, setShow] = createSignal(!!state.init?.config.maintenance)

  return (
    <Modal show={show()} close={() => setShow(false)} title="Maintenance Mode">
      <div class="flex flex-col gap-4">
        <div>Charluv is currently down for maintenance</div>

        <div>You can continue to use the site as a guest.</div>

        <div>Reason: {state.init?.config.maintenance}</div>
      </div>
    </Modal>
  )
}

export default Maintenance
