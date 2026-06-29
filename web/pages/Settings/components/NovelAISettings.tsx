import { Component, Show, createMemo } from 'solid-js'
import TextInput from '../../../shared/TextInput'
import { userStore } from '../../../store'
import Button from '../../../shared/Button'
import Select from '../../../shared/Select'
import Divider from '/web/shared/Divider'

const NovelAISettings: Component = () => {
  const state = userStore()

  const novelVerified = createMemo(
    () => (state.user?.novelApiKey || state.user?.novelVerified ? 'API Key has been verified' : ''),
    { equals: false }
  )

  return (
    <>
      <Select
        fieldName="novelModel"
        label="Default NovelAI Model"
        helperText="This will be used for inferencing. E.g. Generating characters, CYOA, Generating Actions, etc."
        items={[
          { label: 'Kayra', value: 'kayra-v1' },
          { label: 'Clio', value: 'clio-v1' },
        ]}
        value={state.user?.novelModel}
      />

      <Divider />

      <TextInput
        fieldName="novelApiKey"
        label="Novel API Key"
        type="password"
        value={''}
        helperText={
          <>
            NEVER SHARE THIS WITH ANYBODY! The token from the NovelAI request authorization.{' '}
            <a
              class="link"
              target="_blank"
              href="https://github.com/agnaistic/agnai/blob/dev/instructions/novel.md"
            >
              Instructions
            </a>
            .
          </>
        }
        placeholder={novelVerified()}
      />

      <Show when={state.user?.novelVerified}>
        <Button schema="red" class="w-max" onClick={() => userStore.deleteKey('novel')}>
          Delete Novel API Key
        </Button>
      </Show>
    </>
  )
}

export default NovelAISettings
