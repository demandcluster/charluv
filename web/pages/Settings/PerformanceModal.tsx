import { X, Signal, RefreshCcw } from 'lucide-solid'
import { Component, Show, onMount, createSignal, createEffect } from 'solid-js'
import { Performance } from '../../../common/performance'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import { Card } from '../../shared/Card'
import { settingStore } from '../../store'
import { rootModalStore } from '/web/store/root-modal'
import PageHeader from '/web/shared/PageHeader'

const PerformanceModal: Component<{
  show: boolean
  close: () => void
}> = (props) => {
  const [cfg, setCfg] = createSignal<Performance | null>(null)

  createEffect(() => {
    const cfd = settingStore((s) => ({
      performance: s.performance,
    }))
    setCfg(cfd)
  })

  const refresh = () => {
    settingStore.getHordePerformance()
    const cfd = settingStore((s) => ({
      performance: s.performance,
    }))
    setCfg(cfd)
  }

  rootModalStore.addModal({
    id: 'performance-modal',
    element: (
      <Modal
        show={props.show}
        close={props.close}
        title="Charluv Horde Status"
        footer={
          <>
            <Button schema="secondary" onClick={refresh}>
              <RefreshCcw /> Refresh
            </Button>
            <Button schema="secondary" onClick={props.close}>
              <X /> Close
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-4 text-sm">
          <Card>
            <PageHeader title="Text" />
            <div class="flex w-full flex-row">
              <div>
                <Show when={cfg()?.performance?.text_worker_count > 0}>
                  <Signal class="align-left" color="green" />
                </Show>
                <Show when={cfg()?.performance?.text_worker_count === 0}>
                  <Signal class="align-left" color="red" />
                </Show>
              </div>
              <div class="px-4">
                <div class="flex flex-row">
                  <div class="w-11/12">Queued Tokens</div>
                  <div class="w-1/12">{cfg()?.performance?.queued_tokens}</div>
                </div>
                <div class="flex flex-row">
                  <div class="w-11/12">Tokens last minute</div>
                  <div class="w-1/12">{cfg()?.performance?.past_minute_tokens}</div>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <PageHeader title="Image" />
            <div class="flex w-full flex-row">
              <div>
                <Show when={cfg()?.performance?.worker_count > 0}>
                  <Signal class="align-left" color="green" />
                </Show>
                <Show when={cfg()?.performance?.worker_count === 0}>
                  <Signal class="align-left" color="red" />
                </Show>
              </div>
              <div class="px-4">
                <div class="flex flex-row">
                  <div class="w-11/12">Queued Megapixels</div>
                  <div class="w-1/12">{cfg()?.performance?.queued_megapixelsteps}</div>
                </div>
                <div class="flex flex-row">
                  <div class="w-11/12">Megapixels last minute</div>
                  <div class="w-1/12">{cfg()?.performance?.past_minute_megapixelsteps}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Modal>
    ),
  })
  return null
}

export default PerformanceModal
