import { Component, For, Show, createSignal } from 'solid-js'
import { Flag, X } from '/web/icons'
import Modal from '../../shared/Modal'
import Button from '../../shared/Button'
import TextInput from '../../shared/TextInput'
import { charsApi } from '../../store/data/chars'
import { toastStore } from '../../store'
import { REPORT_REASONS } from '/common/publish'

const ReportModal: Component<{
  show: boolean
  close: () => void
  charId: string
  name?: string
}> = (props) => {
  const [reason, setReason] = createSignal('')
  const [note, setNote] = createSignal('')
  const [sending, setSending] = createSignal(false)

  const submit = async () => {
    if (!reason()) return
    setSending(true)
    const res = await charsApi.reportCharacter(props.charId, reason(), note().trim() || undefined)
    setSending(false)
    if (res.error) {
      toastStore.error(`Could not submit report: ${res.error}`)
      return
    }
    toastStore.success('Thanks — our moderators will take a look.')
    setReason('')
    setNote('')
    props.close()
  }

  return (
    <Modal
      show={props.show}
      close={props.close}
      maxWidth="half"
      title={
        <span class="flex items-center gap-2">
          <Flag size={18} /> Report {props.name || 'character'}
        </span>
      }
      footer={
        <>
          <Button schema="secondary" onClick={props.close}>
            <X /> Cancel
          </Button>
          <Button schema="red" onClick={submit} disabled={!reason() || sending()}>
            <Flag /> {sending() ? 'Sending…' : 'Submit report'}
          </Button>
        </>
      }
    >
      <div class="flex flex-col gap-3 text-sm">
        <p class="text-600">Tell us what's wrong with this character. Reports are anonymous.</p>
        <div class="flex flex-wrap gap-2">
          <For each={REPORT_REASONS}>
            {(r) => (
              <button
                class="rounded-full border px-3 py-1.5 text-sm"
                classList={{
                  'border-[var(--hl-500)] bg-[var(--hl-900)]': reason() === r.value,
                  'border-[var(--bg-700)]': reason() !== r.value,
                }}
                onClick={() => setReason(r.value)}
              >
                {r.label}
              </button>
            )}
          </For>
        </div>
        <Show when={reason()}>
          <TextInput
            fieldName="note"
            isMultiline
            placeholder="Anything else we should know? (optional)"
            value={note()}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </Show>
      </div>
    </Modal>
  )
}

export default ReportModal
