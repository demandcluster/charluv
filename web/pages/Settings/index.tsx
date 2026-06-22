import { Component, Show } from 'solid-js'
import { AlertTriangle } from 'lucide-solid'
import Button from '../../shared/Button'
import PageHeader from '../../shared/PageHeader'
import { setComponentPageTitle } from '../../shared/util'
import { settingStore, userStore } from '../../store'
import UISettings from './UISettings'
import { RootModal } from '/web/shared/Modal'
import { Page } from '/web/Layout'

// Settings has been pared back to a single page: UI Settings. The old tabbed
// modal (AI / Voice / Subscription / Guest) is gone — there's one text adapter,
// fixed reply-style presets and tier-based models so the AI tab was vestigial,
// voice config is dropped for now (the voice mechanics stay), and subscriptions
// live on the profile page. Guest-data deletion is the only non-UI control kept
// here, since it's the sole way a logged-out user can wipe local state.
export const SettingsModal = () => {
  const state = settingStore()
  return (
    <RootModal
      show={state.showSettings}
      close={() => settingStore.modal(false)}
      fixedHeight
      maxWidth="half"
      footer={
        <Button schema="secondary" onClick={() => settingStore.modal(false)}>
          Close
        </Button>
      }
    >
      <Settings />
    </RootModal>
  )
}

const Settings: Component = () => {
  setComponentPageTitle('Settings')
  const state = userStore()

  const version = (
    window.charluv_version?.includes('unknown') ? '' : window.charluv_version || ''
  ).slice(0, 7)

  return (
    <Page>
      <PageHeader
        title="Settings"
        subtitle={
          <Show when={!!version}>
            <em>v.{version}</em>
          </Show>
        }
        noDivider
      />

      <div class="flex flex-col gap-4">
        <UISettings />

        <Show when={!state.loggedIn}>
          <div class="mb-4 mt-8 flex w-full flex-col items-center justify-center gap-2">
            <div>This cannot be undone!</div>
            <Button schema="red" onClick={userStore.clearGuestState}>
              <AlertTriangle /> Delete Guest State <AlertTriangle />
            </Button>
          </div>
        </Show>
      </div>
    </Page>
  )
}

export default Settings
