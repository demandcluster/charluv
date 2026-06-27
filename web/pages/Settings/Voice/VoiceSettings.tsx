import { userStore } from '../../../store'
import { Component } from 'solid-js'
import { Toggle } from '../../../shared/Toggle'
import Divider from '../../../shared/Divider'

export const VoiceSettings: Component = () => {
  const state = userStore()

  return (
    <>
      <div class="flex flex-col gap-4">
        <p class="text-lg font-bold">Text to Speech (Character Voice)</p>

        <p class="italic">
          Only for characters that have a voice <em>(premium only)</em>
        </p>

        <Toggle
          label="Enabled"
          helperText="Characters with a configured voice will speak automatically."
          fieldName="textToSpeechEnabled"
          value={state.user?.texttospeech?.enabled ?? true}
        />

        <Toggle
          label="Filter Action Text"
          helperText="Skips text in asterisks and parenthesis."
          fieldName="textToSpeechFilterActions"
          value={state.user?.texttospeech?.filterActions ?? true}
        />

        <Divider />
      </div>
    </>
  )
}
