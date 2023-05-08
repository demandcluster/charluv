import { Component, Show, createMemo, createSignal } from 'solid-js'
import { AppSchema } from '../../../srv/db/schema'
import Modal from '../../shared/Modal'
import { getPresetOptions } from '../../shared/adapter'
import { chatStore, presetStore, settingStore, toastStore } from '../../store'
import Select from '../../shared/Select'
import Button from '../../shared/Button'
import { ADAPTER_LABELS } from '../../../common/adapters'
import { isDefaultPreset } from '../../../common/presets'
import { A } from '@solidjs/router'

const ForcePresetModal: Component<{ chat: AppSchema.Chat; show: boolean; close: () => void }> = (
  props
) => {
  let ref: any
  const presets = presetStore((s) => s.presets)
  const adapters = settingStore((s) => s.config.adapters)
  const options = createMemo(() => getPresetOptions(presets).filter((pre) => pre.value !== 'chat'))

  const [presetId, setPresetId] = createSignal(props.chat.genPreset || options()[0].value)
  const [preset, setPreset] = createSignal<AppSchema.UserGenPreset>()
  const [service, setService] = createSignal<string>()

  const services = createMemo(() => {
    const list = adapters.map((adp) => ({ value: adp, label: ADAPTER_LABELS[adp] }))
    return [{ label: 'None', value: '' }].concat(list)
  })

  const savePreset = () => {
    const id = 'horde'
    if (!id) {
      toastStore.error(`Please select a preset`)
      return
    }

    chatStore.editChatGenPreset(props.chat._id, id, props.close)

    const userPreset = preset()
    const svc = service()
    if (userPreset && !isDefaultPreset(userPreset._id)) {
      if (!svc) return

      presetStore.updatePreset(userPreset._id, { service: svc as any })
    }
  }

  const onPresetChange = (id: string) => {
    setPresetId(id)
    console.log('id', id)
    const userPreset = presets.find((p) => p._id === id)
    setService(userPreset?.service || '')
    setPreset(userPreset)
  }
  savePreset()
  const Footer = (
    <>
      <Button onClick={savePreset} disabled={preset() && !preset()?.service && !service()}>
        Save
      </Button>
    </>
  )
  return <></>
}

export default ForcePresetModal
