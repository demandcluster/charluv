import { Import, X } from '/web/icons'
import { Component, For, Show, createSignal } from 'solid-js'
import FileInput, { FileInputResult } from '../../shared/FileInput'
import Modal from '../../shared/Modal'
import { characterStore, NewCharacter } from '../../store'
import AvatarIcon from '/web/shared/AvatarIcon'
import { SUPPORTED_FORMATS, importCharacterFile } from './port'
import Button from '/web/shared/Button'

const MAX_SHOWN_IMPORTS = 3

const ImportCharacterModal: Component<{
  show: boolean
  close: () => void
  onSave: (chars: NewCharacter[], images: Array<File | undefined>) => void
  single?: boolean
}> = (props) => {
  const state = characterStore()
  const [imported, setImported] = createSignal<NewCharacter[]>([])
  const [images, setImages] = createSignal<Array<File | undefined>>([])
  const [failed, setFailed] = createSignal<string[]>([])
  const [ready, setReady] = createSignal(false)

  const processFiles = async (files: FileInputResult[]) => {
    reset()

    const results = await Promise.allSettled(files.map(importCharacterFile))
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        setFailed(failed().concat(files[i].file.name))
      } else {
        setImported(imported().concat(result.value.char))
        setImages(images().concat(result.value.image))
      }
    }

    setReady(imported().length > 0)
  }

  const onImport = async () => {
    if (!ready()) return
    props.onSave(imported(), images())
  }

  const reset = () => {
    setReady(false)
    setImages([])
    setImported([])
    setFailed([])
  }

  const cancel = () => {
    reset()
    props.close()
  }

  return (
    <Modal
      show={props.show}
      title="Import Character"
      close={cancel}
      footer={
        <>
          <Button schema="secondary" onClick={cancel}>
            <X />
            Cancel
          </Button>

          <Button onClick={onImport} disabled={state.creating || !ready()}>
            <Import />
            Import
          </Button>
        </>
      }
    >
      <div class="flex flex-col gap-2">
        <FileInput
          label="Avatar or JSON file"
          fieldName="file"
          accept="text/json,application/json,image/png,image/jpeg,image/webp"
          helperText={`Supported formats: ${SUPPORTED_FORMATS}`}
          required
          multiple={!props.single}
          onUpdate={processFiles}
        />
      </div>

      <Show when={imported().length}>
        <div class="mt-2 text-lg">Characters to import:</div>
        <div class="markdown">
          <ul>
            <For each={imported().slice(0, MAX_SHOWN_IMPORTS)}>
              {(i) => (
                <li class="flex gap-2">
                  <AvatarIcon format={{ corners: 'circle', size: 'sm' }} avatarUrl={i.avatar} />
                  {i.name ?? 'Unnamed'}
                </li>
              )}
            </For>
            <Show when={imported().length === MAX_SHOWN_IMPORTS + 1}>
              <li>... and one other</li>
            </Show>
            <Show when={imported().length > MAX_SHOWN_IMPORTS + 1}>
              <li>... and {imported().length - MAX_SHOWN_IMPORTS} others</li>
            </Show>
          </ul>
        </div>
      </Show>

      <Show when={failed().length}>
        <div class="mt-2 text-lg">Failed character imports:</div>
        <div class="markdown">
          <ul>
            <For each={failed().slice(0, MAX_SHOWN_IMPORTS)}>
              {(i) => <li>{i ?? 'Unnamed'}</li>}
            </For>
            <Show when={failed().length === MAX_SHOWN_IMPORTS + 1}>
              <li>... and one other</li>
            </Show>
            <Show when={failed().length > MAX_SHOWN_IMPORTS + 1}>
              <li>... and {failed().length - MAX_SHOWN_IMPORTS} others</li>
            </Show>
          </ul>
        </div>
      </Show>
    </Modal>
  )
}

export default ImportCharacterModal
