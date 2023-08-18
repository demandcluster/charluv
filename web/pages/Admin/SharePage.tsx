import { Save, X } from 'lucide-solid'
import { Component, createEffect, createSignal, For, Show, onMount } from 'solid-js'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import PageHeader from '../../shared/PageHeader'
import TextInput from '../../shared/TextInput'
import { getAssetUrl, getStrictForm, setComponentPageTitle } from '../../shared/util'
import { adminStore } from '../../store'
import { AppSchema } from '/common/types'

const SharePage: Component = () => {
  let ref: any
  setComponentPageTitle('Shared Characters')
  const [pw, setPw] = createSignal<AppSchema.User>()
  const state = adminStore()
  const [decline, setDecline] = createSignal<string>('')
  const [accept, setAccept] = createSignal<string>('')
  const [info, setInfo] = createSignal<{
    name: string
    persona: any
    description: string
    avatar: string
    scenario: string
    greeting: string
  }>()

  const loadInfo = (shared: any) => {
    setInfo(shared)
  }

  const updateDecline = (declined: string) => {
    setDecline(declined)
  }
  const updateAccept = (accept: string) => {
    setAccept(accept)
  }

  const submitDecline = async () => {
    await adminStore.declineShared({
      characterId: info()?._id,
      userId: info()?.userId,
      reason: decline(),
    })
    adminStore.getShared()
    setInfo()
  }
  const submitAccept = async () => {
    await adminStore.acceptShared({
      characterId: info()?._id,
      userId: info()?.userId,
      amount: accept(),
    })
    adminStore.getShared()
    setInfo()
  }

  onMount(() => {
    adminStore.getMetrics()
    adminStore.getShared()
  })

  return (
    <div>
      <PageHeader title="Shared Characters" />

      <div class="flex flex-col gap-2 pb-4">
        <For each={state.shared}>
          {(shared) => (
            <div class="bg-800 flex h-24 flex-row items-center gap-2 rounded-xl">
              <div class="w-2/12 px-4 text-xs">{shared._id}</div>
              <div class="w-2/12 px-4">{shared.name}</div>

              <div class="flex w-4/12 justify-center">
                <img src={getAssetUrl(shared?.avatar)} height="64px" />
              </div>

              <div class="flex w-4/12 justify-end gap-2 pr-2">
                <Button size="sm" onClick={() => loadInfo(shared)}>
                  Info {shared.name}
                </Button>
              </div>
            </div>
          )}
        </For>

        <InfoModel
          show={!!info()}
          updateDecline={updateDecline}
          submitDecline={submitDecline}
          updateAccept={updateAccept}
          submitAccept={submitAccept}
          close={() => setInfo()}
          accept={accept() || ''}
          decline={decline() || ''}
          description={info()?.description}
          scenario={info()?.scenario}
          greeting={info()?.greeting}
          persona={info()?.persona}
          avatar={info()?.avatar}
          name={info()?.name!}
        />
      </div>
    </div>
  )
}

export default SharePage

const InfoModel: Component<{ show: boolean; close: () => void; shared: any }> = (props) => {
  const state = adminStore()
  return (
    <Modal
      show={props.show}
      close={props.close}
      title={`${props.name}: ${props?.description || '...'}`}
      footer={<Button onClick={props.close}>Close</Button>}
    >
      <div class="flex flex-col gap-4 overflow-auto">
        <TextInput
          fieldName="greeting"
          label="Greeting"
          spellcheck
          isMultiline
          value={props?.greeting}
          disabled
        />
        <TextInput
          fieldName="scenario"
          label="Scenario"
          spellcheck
          isMultiline
          value={props?.scenario}
          disabled
        />

        <TextInput
          fieldName="type"
          spellcheck
          isMultiline
          label={`Persona Kind: ${props?.persona?.kind}`}
          value={JSON.stringify(props?.persona?.attributes)}
          disabled
        />

        <Show when={props?.avatar}>
          <div class="flex w-full justify-center">
            <img src={getAssetUrl(props?.avatar!)} height="256px" />
          </div>
        </Show>

        <TextInput
          fieldName="declined"
          label="Decline"
          onChange={(event) => props.updateDecline(event.target.value)}
          value={props.decline}
          spellcheck
        />
        <Button class="text-error" onClick={() => props.submitDecline()}>
          ** Decline **
        </Button>
        <TextInput
          fieldName="accept"
          label="Reward amount"
          onChange={(event) => props.updateAccept(event.target.value)}
          value={props.accept}
          spellcheck
        />
        <Button class="success" onClick={() => props.submitAccept()}>
          Accept & Reward
        </Button>
      </div>
    </Modal>
  )
}
