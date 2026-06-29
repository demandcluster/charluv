import {
  Component,
  JSX,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { characterStore, chatStore, toastStore } from '/web/store'
import Convertible from '../../../shared/Mode/Convertible'
import { useParams, useSearchParams } from '@solidjs/router'
import { getActiveBots } from '../util'
import { AppSchema } from '/common/types'
import { CreateCharacterForm } from '../../Character/CreateCharacterForm'
import Loading from '/web/shared/Loading'
import MemberModal from '../MemberModal'
import { wait } from '/common/util'
import CharacterSelect from '/web/shared/CharacterSelect'
import ChatSettings from '../ChatSettings'
import LongTermMemory from './LongTermMemory'
import { usePaneManager } from '/web/shared/hooks'

export { ChatPanes as default }

export const useValidChatPane = () => {
  const [search] = useSearchParams()

  const isValidPane = createMemo(() => {
    switch (search.pane) {
      // 'preset' pane removed — reply style now lives in Chat Settings.
      case 'character':
      case 'participants':
      case 'chat-settings':
      case 'memory':
      case 'other':
        return true

      default:
        return false
    }
  })

  return isValidPane
}

const ChatPanes: Component<{}> = (props) => {
  const params = useParams()
  const pane = usePaneManager()

  const chars = characterStore((s) => ({
    chatBots: s.characters.list,
    botMap: s.characters.map,
    impersonate: s.impersonating,
  }))

  const chats = chatStore((s) => {
    return {
      ...(s.active?.chat._id === params.id ? s.active : undefined),
      opts: s.opts,
      activeBots: getActiveBots(s.active?.chat!, chars.botMap),
      tempBots: Object.values(s.active?.chat?.tempCharacters! || {}),
    }
  })

  const [paneFooter, setPaneFooter] = createSignal<JSX.Element>()
  const [editId, setEditId] = createSignal<string>()

  // const isValidPane = useValidChatPane()

  onCleanup(() => {
    closeCharEditor(false)
  })

  createEffect(() => {
    setEditId(chats.char?._id ?? '')
  })

  const editableCharcters = createMemo(() => {
    const ids = new Map<string, AppSchema.Character>()

    if (chats.char) {
      ids.set(chats.char._id, chats.char)
    }

    if (chars.impersonate) {
      ids.set(chars.impersonate._id, chars.impersonate)
    }

    for (const bot of chats.activeBots) {
      if (bot.deletedAt) continue
      if (bot._id.startsWith('temp-') && bot.favorite === false) continue
      ids.set(bot._id, bot)
    }

    for (const bot of Object.values(chats.chat?.tempCharacters || {})) {
      ids.set(bot._id, bot)
    }

    const editable = Array.from(ids.values())
    return editable
  })

  const charBeingEdited = createMemo(() => {
    return editableCharcters().find((ch) => ch._id === editId())
  })

  // Characters whose memories the owner can view in the memory pane. Like the
  // editor list but excludes the impersonated self (the owner has no memories).
  const memoryChars = createMemo(() => {
    const ids = new Map<string, AppSchema.Character>()

    if (chats.char) {
      ids.set(chats.char._id, chats.char)
    }

    for (const bot of chats.activeBots) {
      if (bot.deletedAt) continue
      if (bot._id.startsWith('temp-') && bot.favorite === false) continue
      ids.set(bot._id, bot)
    }

    for (const bot of Object.values(chats.chat?.tempCharacters || {})) {
      ids.set(bot._id, bot)
    }

    return Array.from(ids.values())
  })

  const changeEditingChar = async (char: AppSchema.Character | undefined) => {
    const prev = editId()
    if (prev === char?._id) return

    setEditId('')
    if (!char) return
    await wait(0.2)
    setEditId(char._id)
  }

  const closePane = (search = true) => {
    if (search) {
      pane.update()
    }
  }

  const closeCharEditor = (search?: boolean) => {
    closePane(search)
    setEditId(chats.char?._id || '')
  }

  return (
    <Show when={pane.showing()}>
      <Switch>
        <Match when={pane.pane() === 'character'}>
          <Convertible title="Edit Character" close={closeCharEditor} footer={paneFooter()}>
            <Show when={editId() !== ''}>
              <CreateCharacterForm
                chat={chats.chat}
                editId={editId()}
                footer={setPaneFooter}
                close={closeCharEditor}
                temp={editId()?.startsWith('temp-')}
                onSuccess={() => toastStore.success('Temporary character updated')}
              >
                <Show when={editableCharcters().length > 1}>
                  <CharacterSelect
                    class="w-full"
                    fieldName="editingId"
                    items={editableCharcters()}
                    value={charBeingEdited()}
                    onChange={changeEditingChar}
                  />
                </Show>
              </CreateCharacterForm>
            </Show>

            <Show when={editId() === ''}>
              <div class="flex h-full w-full items-center justify-center">
                <Loading />
              </div>
            </Show>
          </Convertible>
        </Match>

        <Match when={pane.pane() === 'memory'}>
          <Convertible close={closePane} footer={paneFooter()} title="Memory">
            <LongTermMemory
              chat={chats.chat!}
              chars={memoryChars()}
              close={closePane}
              footer={setPaneFooter}
            />
          </Convertible>
        </Match>

        <Match when={pane.pane() === 'participants'}>
          <MemberModal show chat={chats.chat!} charId={chats?.char?._id!} close={closePane} />
        </Match>

        <Match when={pane.pane() === 'chat-settings'}>
          <Convertible close={closePane} title="Reply Style" footer={paneFooter()}>
            <ChatSettings footer={setPaneFooter} close={closePane} />
          </Convertible>
        </Match>
      </Switch>
    </Show>
  )
}
