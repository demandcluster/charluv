import { X, Signal, RefreshCcw } from '/web/icons'
import { Component, Show } from 'solid-js'
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
  const perf = settingStore((s) => s.performance)

  const refresh = () => {
    settingStore.getHordePerformance()
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
                <Show when={perf.text_worker_count > 0}>
                  <Signal class="align-left" color="green" />
                </Show>
                <Show when={perf.text_worker_count === 0}>
                  <Signal class="align-left" color="red" />
                </Show>
              </div>
              <div class="px-4">
                <div class="flex flex-row">
                  <div class="w-11/12">Queued Tokens</div>
                  <div class="w-1/12">{perf.queued_tokens}</div>
                </div>
                <div class="flex flex-row">
                  <div class="w-11/12">Tokens last minute</div>
                  <div class="w-1/12">{perf.past_minute_tokens}</div>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <PageHeader title="Image" />
            <div class="flex w-full flex-row">
              <div>
                <Show when={perf.worker_count > 0}>
                  <Signal class="align-left" color="green" />
                </Show>
                <Show when={perf.worker_count === 0}>
                  <Signal class="align-left" color="red" />
                </Show>
              </div>
              <div class="px-4">
                <div class="flex flex-row">
                  <div class="w-11/12">Queued Megapixels</div>
                  <div class="w-1/12">{perf.queued_megapixelsteps}</div>
                </div>
                <div class="flex flex-row">
                  <div class="w-11/12">Megapixels last minute</div>
                  <div class="w-1/12">{perf.past_minute_megapixelsteps}</div>
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
