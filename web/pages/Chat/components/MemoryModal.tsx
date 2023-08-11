import { Save } from 'lucide-solid'
import { Component, createMemo, createSignal, onMount, Show } from 'solid-js'
import { AppSchema } from '../../../../common/types/schema'
import Button from '../../../shared/Button'
import Divider from '../../../shared/Divider'
import Select, { Option } from '../../../shared/Select'
import Modal from '../../../shared/Modal'
import { chatStore } from '../../../store'
import { memoryStore } from '../../../store'
import EditMemoryForm, { EntrySort } from '../../Memory/EditMemory'
import EmbedContent from '../../Memory/EmbedContent'
import PageHeader from '/web/shared/PageHeader'
import { A } from '@solidjs/router'

const ChatMemoryModal: Component<{
  chat: AppSchema.Chat
  show: boolean
  close: () => void
}> = (props) => {
  const state = memoryStore((s) => ({
    books: s.books,
    items: s.books.list.map((book) => ({ label: book.name, value: book._id })),
    embeds: s.embeds.filter((em) => em.metadata.type === 'user'),
  }))

  const [id, setId] = createSignal(props.chat.memoryId || '')
  const [embedId, setEmbedId] = createSignal(props.chat.userEmbedId)
  const [book, setBook] = createSignal<AppSchema.MemoryBook>()
  const [entrySort, setEntrySort] = createSignal<EntrySort>('creationDate')
  const updateEntrySort = (item: Option<string>) => {
    if (item.value === 'creationDate' || item.value === 'alpha') {
      setEntrySort(item.value)
    }
  }

  const changeBook = async (id: string) => {
    setId(id)
    setBook(undefined)
    await Promise.resolve()

    const match = state.books.list.find((book) => book._id === id)
    setBook(match)
  }

  onMount(() => {
    changeBook(props.chat.memoryId || '')
    memoryStore.listCollections()
  })

  const onSubmit = (ev: Event) => {
    ev.preventDefault()
    const update = book()
    if (!id() || !update) return
    memoryStore.update(id(), update)
  }

  const useMemoryBook = () => {
    if (!props.chat._id) return
    chatStore.editChat(props.chat._id, { memoryId: id() }, undefined)
  }

  const useUserEmbed = () => {
    chatStore.editChat(props.chat._id, { userEmbedId: embedId() }, undefined)
  }

  const Footer = () => (
    <>
      <Button schema="secondary" onClick={props.close}>
        Close
      </Button>
      <Button disabled={id() === ''} type="submit">
        <Save />
        Save Memory Book
      </Button>
    </>
  )

  const embeds = createMemo(() => {
    return [{ label: 'None', value: '' }].concat(
      state.embeds.map((em) => ({ label: em.name, value: em.name }))
    )
  })

  return (
    <Modal
      show={props.show}
      close={props.close}
      footer={<Footer />}
      onSubmit={onSubmit}
      maxWidth="half"
      fixedHeight
    >
      <PageHeader
        title="Memory"
        subtitle={
          <A class="link" href="/guides/memory">
            Memory Guide
          </A>
        }
      />
      <div class="flex flex-col gap-2">
        <Select
          fieldName="memoryId"
          label="Chat Memory Book"
          helperText="The memory book your chat will use"
          items={[{ label: 'None', value: '' }].concat(state.items)}
          value={id()}
          onChange={(item) => changeBook(item.value)}
        />
        <Button
          disabled={id() === (props.chat.memoryId || '')}
          class="h-fit w-fit"
          onClick={useMemoryBook}
        >
          <Save />
          Use Memory Book
        </Button>
        <Divider />
        <Show when={state.embeds.length > 0}>
          <Select
            fieldName="embedId"
            label="Embedding"
            helperText="Local Pipeline: Which user-created embedding to use."
            items={embeds()}
            onChange={(item) => setEmbedId(item.value)}
            value={embedId()}
          />
          <Button
            class="w-fit"
            disabled={embedId() === props.chat.userEmbedId}
            onClick={useUserEmbed}
          >
            <Save />
            Use Embedding
          </Button>
          <Divider />
        </Show>
        <EmbedContent />

        <Show when={book()}>
          <div class="text-sm">
            <EditMemoryForm
              hideSave
              book={book()!}
              entrySort={entrySort()}
              updateEntrySort={updateEntrySort}
              onChange={setBook}
            />
          </div>
        </Show>
      </div>
    </Modal>
  )
}

export default ChatMemoryModal
