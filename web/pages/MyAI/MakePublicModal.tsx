import { Component, For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { Check, X, Sparkles, Globe } from 'lucide-solid'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import { charsApi, PublishStatus } from '../../store/data/chars'
import { imageApi } from '../../store/data/image'
import { characterStore } from '../../store/character'
import { subscribe } from '../../store/socket'
import {
  checkPublishRequirements,
  PUBLISH_RULES,
  PUBLISH_RULES_NOTE,
  FLAG_LABELS,
} from '/common/publish'
import { AppSchema } from '/common/types'

type Phase = 'idle' | 'checking' | 'approved' | 'rejected' | 'error'

const MakePublicModal: Component<{
  show: boolean
  close: () => void
  char: AppSchema.Character
}> = (props) => {
  const [status, setStatus] = createSignal<PublishStatus>()
  const [phase, setPhase] = createSignal<Phase>('idle')
  const [result, setResult] = createSignal<{ reason?: string; flags?: string[]; rewarded?: number }>(
    {}
  )

  const reqs = createMemo(() => checkPublishRequirements(props.char))
  const ready = createMemo(
    () => reqs().ok && (status()?.enabled ?? true) && (status()?.remaining ?? 1) > 0
  )

  createEffect(() => {
    if (!props.show) return
    setPhase('idle')
    setResult({})
    charsApi.getPublishStatus().then((r) => r.result && setStatus(r.result))
  })

  const publish = async () => {
    setPhase('checking')
    const image = props.char.avatar
      ? await imageApi.getImageData(props.char.avatar)
      : undefined
    const { res, requestId } = await charsApi.publishCharacter(props.char._id, image)
    if (res.error) {
      setPhase('error')
      setResult({ reason: res.error })
      return
    }

    subscribe(
      'publish-response',
      { acceptable: 'boolean?', requestId: 'string', reason: 'string?', flags: 'any?', rewarded: 'number?' },
      (body) => {
        if (body.acceptable) {
          setPhase('approved')
          setResult({ rewarded: body.rewarded })
          characterStore.getCharacters(true)
        } else {
          setPhase('rejected')
          setResult({ reason: body.reason, flags: (body.flags as string[]) || [] })
        }
      },
      (body) => body.requestId === requestId
    )
  }

  const footer = (
    <>
      <Button schema="secondary" onClick={props.close}>
        <X /> {phase() === 'approved' ? 'Done' : 'Cancel'}
      </Button>
      <Show when={phase() !== 'approved'}>
        <Button onClick={publish} disabled={!ready() || phase() === 'checking'}>
          <Globe />
          {phase() === 'checking' ? 'Checking…' : 'Make public'}
        </Button>
      </Show>
    </>
  )

  return (
    <Modal
      show={props.show}
      close={props.close}
      maxWidth="half"
      title={
        <span class="flex items-center gap-2">
          <Globe size={18} /> Make “{props.char.name}” public
        </span>
      }
      footer={footer}
    >
      <div class="flex flex-col gap-4 text-sm">
        <Show when={phase() === 'approved'}>
          <div class="rounded-lg bg-[var(--hl-900)] p-4 text-center">
            <div class="text-lg font-bold">Your character is live ✨</div>
            <p class="text-600 mt-1">
              {props.char.name} now appears in Discover for everyone.
              <Show when={(result().rewarded ?? 0) > 0}>
                {' '}
                You earned <b>{result().rewarded} credits</b>.
              </Show>
            </p>
          </div>
        </Show>

        <Show when={phase() === 'rejected' || phase() === 'error'}>
          <div class="rounded-lg border border-[var(--bg-700)] bg-[var(--bg-900)] p-4">
            <div class="font-bold text-[var(--red-500)]">Not published</div>
            <p class="text-600 mt-1">{result().reason || 'It did not pass the content check.'}</p>
            <Show when={result().flags?.length}>
              <div class="mt-2 flex flex-wrap gap-1">
                <For each={result().flags}>
                  {(f) => (
                    <span class="rounded bg-[var(--bg-700)] px-2 py-0.5 text-xs">
                      {FLAG_LABELS[f] || f}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={phase() === 'idle' || phase() === 'checking'}>
          <p class="text-600">
            Public characters show up in Discover for everyone. Yours stays yours — others get their
            own copy when they pick it. A quick automated check runs first.
          </p>

          {/* Requirements checklist */}
          <div>
            <div class="mb-1 font-semibold">Minimum requirements</div>
            <ul class="flex flex-col gap-1">
              <For each={reqs().requirements}>
                {(r) => (
                  <li class="flex items-center gap-2" classList={{ 'text-600': r.ok }}>
                    <Show
                      when={r.ok}
                      fallback={<X size={15} class="text-[var(--red-500)]" />}
                    >
                      <Check size={15} class="text-[var(--green-600,#3aa)]" />
                    </Show>
                    {r.label}
                    <span class="text-500 text-xs">
                      {r.actual}/{r.min}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </div>

          {/* Content rules */}
          <div>
            <div class="mb-1 font-semibold">Content rules</div>
            <ul class="text-600 flex list-disc flex-col gap-1 pl-5">
              <For each={PUBLISH_RULES}>{(rule) => <li>{rule}</li>}</For>
            </ul>
            <p class="text-500 mt-2 text-xs italic">{PUBLISH_RULES_NOTE}</p>
            <Show when={status()?.guidelines}>
              <p class="text-500 mt-1 text-xs">{status()!.guidelines}</p>
            </Show>
          </div>

          <Show when={status()}>
            <div class="text-500 flex items-center justify-between border-t border-[var(--bg-800)] pt-3 text-xs">
              <span class="flex items-center gap-1">
                <Sparkles size={13} /> Reward: {status()!.reward} credits
              </span>
              <span>
                Publishes left today: <b>{status()!.remaining}</b> / {status()!.cap}
              </span>
            </div>
          </Show>

          <Show when={status() && !status()!.enabled}>
            <div class="text-[var(--red-500)]">Publishing isn’t available for your account.</div>
          </Show>
          <Show when={status() && status()!.enabled && status()!.remaining <= 0}>
            <div class="text-[var(--red-500)]">
              You’ve hit today’s publish limit. Try again tomorrow.
            </div>
          </Show>
        </Show>
      </div>
    </Modal>
  )
}

export default MakePublicModal
