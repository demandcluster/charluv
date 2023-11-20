import { Component, createEffect, createSignal, onMount } from 'solid-js'
import { getEncoder } from '../../../../common/tokenize'
import Modal from '../../../shared/Modal'
import TextInput from '../../../shared/TextInput'
import { chatStore, userStore } from '../../../store'
import { TokenCounter } from '/common/types'

const PromptModal: Component = () => {
  const user = userStore()
  const state = chatStore((s) => ({ prompt: s.prompt, chat: s.active?.chat }))
  const [encoder, setEncoder] = createSignal<TokenCounter>()
  const [tokens, setTokens] = createSignal(0)

  onMount(async () => {
    const enc = await getEncoder()
    setEncoder(() => enc)
  })

  createEffect(async () => {
    if (!state.chat) return '...'
    if (!user.user) return '....'
    if (!encoder()) return '.....'

    const count = await encoder()!(state.prompt?.template.parsed || '')
    setTokens(count)
  })

  return (
    <Modal
      show={!!state.prompt}
      close={chatStore.closePrompt}
      title="Message Prompt"
      maxWidth="half"
    >
      <TextInput
        class="min-h-[300px] text-sm"
        fieldName="prompt"
        label="Prompt"
        helperText={
          <div class="flex flex-col gap-2">
            <div>
              This is an approximation. It may differ from the prompt actually used at the time. For
              authenticated users, the prompt generated on the server may contain more context as it
              retrieves messages from the database until the 'history' portion of your prompt is
              full.
            </div>
            <div>
              The entire 'budget' may not get used here as token counts may change due to
              formatting.
            </div>
            <div class="font-bold">Est. tokens: {tokens()}</div>
          </div>
        }
        value={state.prompt?.template.parsed}
        isMultiline
        disabled
      />
    </Modal>
  )
}

export default PromptModal
