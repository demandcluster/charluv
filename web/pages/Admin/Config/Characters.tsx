import { Component, Setter, createSignal } from 'solid-js'
import { usePresetOptions } from '/web/shared/hooks'
import { PresetSelect } from '/web/shared/PresetSelect'
import TextInput from '/web/shared/TextInput'
import { adminStore } from '/web/store'
import { JsonSchema } from '/web/shared/JsonSchema'
import { neat } from '/common/util'
import Select from '/web/shared/Select'
import { JsonField } from '/common/prompt'

export const CharLibrary: Component<{ setSchema: Setter<JsonField[]> }> = (props) => {
  const presets = usePresetOptions()
  const state = adminStore()

  const [presetId, setPresetId] = createSignal(state.config?.modPresetId)

  return (
    <div class="flex flex-col gap-2">
      <Select
        fieldName="charlibPublish"
        label="Publishing Permission Level"
        items={[
          { label: 'Off', value: 'off' },
          { label: 'Users', value: 'users' },
          { label: 'Subscribers', value: 'subscribers' },
          { label: 'Moderators', value: 'moderators' },
          { label: 'Admins', value: 'admins' },
        ]}
        value={state.config?.charlibPublish}
      />
      <TextInput
        fieldName="charlibGuidelines"
        label="Publishing Guidelines"
        isMultiline
        value={state.config?.charlibGuidelines}
      />
      <div class="flex flex-wrap gap-2">
        <TextInput
          type="number"
          fieldName="publishDailyFree"
          label="Daily publishes (free)"
          value={state.config?.publishDailyFree ?? 2}
        />
        <TextInput
          type="number"
          fieldName="publishDailyPremium"
          label="Daily publishes (premium)"
          value={state.config?.publishDailyPremium ?? 10}
        />
        <TextInput
          type="number"
          fieldName="publishReward"
          label="Publish reward (credits)"
          value={state.config?.publishReward ?? 500}
        />
      </div>
      <div class="text-700 text-sm font-bold">Minimum requirements (characters)</div>
      <div class="flex flex-wrap gap-2">
        <TextInput
          type="number"
          fieldName="publishMinGreeting"
          label="Greeting"
          value={state.config?.publishMinGreeting ?? 50}
        />
        <TextInput
          type="number"
          fieldName="publishMinDescription"
          label="Description"
          value={state.config?.publishMinDescription ?? 150}
        />
        <TextInput
          type="number"
          fieldName="publishMinScenario"
          label="Scenario"
          value={state.config?.publishMinScenario ?? 300}
        />
        <TextInput
          type="number"
          fieldName="publishMinPersonality"
          label="Personality & details"
          value={state.config?.publishMinPersonality ?? 400}
        />
      </div>
      <PresetSelect
        label="Preset"
        fieldName="modPresetId"
        options={presets()}
        selected={presetId()}
        setPresetId={setPresetId}
      />

      <TextInput
        fieldName="modPrompt"
        label="Prompt"
        value={state.config?.modPrompt}
        isMultiline
        helperMarkdown={fieldHelp}
      />

      <TextInput
        fieldName="modFieldPrompt"
        label="Field Prompt"
        value={state.config?.modFieldPrompt}
        isMultiline
        placeholder="Optional."
      />

      <JsonSchema inherit={state.config?.modSchema} update={props.setSchema} validate />
    </div>
  )
}

const fieldHelp = neat`
**Must include \`{{fields}}\` in the main prompt**
**Field Prompt Placeholders**
\`{{prop}}\` Character field name. E.g. Greeting, Appearance, Description, etc.
\`{{value}}\` Value of the character field.
`
