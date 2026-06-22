import { Component, createSignal, For, Show, onMount } from 'solid-js'
import Button from '../../shared/Button'
import PageHeader from '../../shared/PageHeader'
import Tabs, { useTabs } from '../../shared/Tabs'
import { getAssetUrl, setComponentPageTitle } from '../../shared/util'
import { adminStore } from '../../store'
import { FLAG_LABELS } from '/common/publish'

/**
 * Character moderation: the reports queue (user-flagged characters) and the
 * stage-2 review of live published characters.
 */
const ModerationPage: Component = () => {
  setComponentPageTitle('Moderation')
  const tabs = useTabs(['Reports', 'Published'], 0)

  return (
    <div>
      <PageHeader title="Moderation" />
      <Tabs tabs={tabs.tabs} select={tabs.select} selected={tabs.selected} />
      <div class="pt-4">
        <Show when={tabs.current() === 'Reports'}>
          <ReportsTab />
        </Show>
        <Show when={tabs.current() === 'Published'}>
          <PublishedTab />
        </Show>
      </div>
    </div>
  )
}

export default ModerationPage

const ReportsTab: Component = () => {
  const state = adminStore()
  const load = () => adminStore.getReports()
  onMount(load)

  const act = async (charId: string, action: 'dismiss' | 'hide' | 'delete') => {
    const ok = await adminStore.resolveReport(charId, action)
    if (ok) load()
  }

  return (
    <div class="flex flex-col gap-2 pb-4">
      <Show when={!state.reports?.length}>
        <div class="text-600 py-8 text-center">No open reports.</div>
      </Show>
      <For each={state.reports}>
        {(r) => (
          <div class="bg-800 flex flex-col gap-2 rounded-xl p-3">
            <div class="flex items-center gap-3">
              <Show when={r.avatar}>
                <img class="h-16 w-16 rounded-md object-cover" src={getAssetUrl(r.avatar)} />
              </Show>
              <div class="flex flex-col">
                <div class="font-bold">
                  {r.name || r.charId}
                  <span class="text-600 ml-2 text-sm">· {r.reportCount} reports</span>
                  <Show when={r.status === 'hidden'}>
                    <span class="ml-2 rounded bg-[var(--bg-700)] px-2 py-0.5 text-xs">hidden</span>
                  </Show>
                </div>
                <div class="text-600 flex flex-wrap gap-1 text-xs">
                  <For each={r.reasons}>
                    {(reason: any) => (
                      <span class="rounded bg-[var(--bg-700)] px-2 py-0.5" title={reason.note || ''}>
                        {reason.reason}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <Button size="sm" schema="secondary" onClick={() => act(r.charId, 'dismiss')}>
                Dismiss & relist
              </Button>
              <Button size="sm" schema="gray" onClick={() => act(r.charId, 'hide')}>
                Keep hidden
              </Button>
              <Button size="sm" class="text-error" schema="red" onClick={() => act(r.charId, 'delete')}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

const PublishedTab: Component = () => {
  const [list, setList] = createSignal<any[]>([])
  const load = async () => {
    const res = await adminStore.getPublished()
    if (res?.published) setList(res.published)
  }
  onMount(load)

  const act = async (charId: string, action: 'reviewed' | 'unpublish' | 'delete') => {
    const ok = await adminStore.moderatePublished(charId, action)
    if (ok) load()
  }

  return (
    <div class="flex flex-col gap-2 pb-4">
      <Show when={!list().length}>
        <div class="text-600 py-8 text-center">No published characters.</div>
      </Show>
      <For each={list()}>
        {(char) => (
          <div class="bg-800 flex items-center gap-3 rounded-xl p-3">
            <Show when={char.avatar}>
              <img class="h-16 w-16 rounded-md object-cover" src={getAssetUrl(char.avatar)} />
            </Show>
            <div class="flex flex-1 flex-col">
              <div class="font-bold">
                {char.name}
                <Show when={!char.moderation?.moderated}>
                  <span class="ml-2 rounded bg-[var(--hl-700)] px-2 py-0.5 text-xs">new</span>
                </Show>
              </div>
              <div class="text-600 flex flex-wrap gap-1 text-xs">
                <For each={char.moderation?.flags || []}>
                  {(f: string) => (
                    <span class="rounded bg-[var(--bg-700)] px-2 py-0.5">{FLAG_LABELS[f] || f}</span>
                  )}
                </For>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <Show when={!char.moderation?.moderated}>
                <Button size="sm" schema="secondary" onClick={() => act(char._id, 'reviewed')}>
                  Mark reviewed
                </Button>
              </Show>
              <Button size="sm" schema="gray" onClick={() => act(char._id, 'unpublish')}>
                Unpublish
              </Button>
              <Button size="sm" class="text-error" schema="red" onClick={() => act(char._id, 'delete')}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
