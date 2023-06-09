import {
  Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from 'solid-js'
import { NewCharacter, characterStore, userStore } from '../../store'
import { tagStore } from '../../store'
import PageHeader from '../../shared/PageHeader'
import Select, { Option } from '../../shared/Select'
import TextInput from '../../shared/TextInput'
import { AppSchema } from '../../../common/types/schema'
import {
  Copy,
  Download,
  Edit,
  Menu,
  MoreHorizontal,
  Trash,
  VenetianMask,
  Import,
  Plus,
  Star,
  SortAsc,
  SortDesc,
  LayoutList,
  Image,
  User,
  MessageCircle,
} from 'lucide-solid'
import { A, useNavigate, useSearchParams } from '@solidjs/router'
import { CharacterAvatar } from '../../shared/AvatarIcon'
import ImportCharacterModal from '../Character/ImportCharacter'
import DeleteCharacterModal from '../Character/DeleteCharacter'
import { getAssetUrl, storage, setComponentPageTitle } from '../../shared/util'
import { DropMenu } from '../../shared/DropMenu'
import Button from '../../shared/Button'
import Loading from '../../shared/Loading'
import Divider from '../../shared/Divider'
import Gauge from '../../shared/Gauge'

import TagSelect from '../../shared/TagSelect'
import AvatarContainer from '/web/shared/Avatar/Container'
import { DownloadModal } from './DownloadModal'
const CACHE_KEY = 'agnai-charlist-cache'

type ViewTypes = 'list' | 'cards'
type SortFieldTypes = 'modified' | 'created' | 'name'
type SortDirectionTypes = 'asc' | 'desc'

type ListCache = {
  view: ViewTypes
  sort: {
    field: SortFieldTypes
    direction: SortDirectionTypes
  }
}

const sortOptions: Option<SortFieldTypes>[] = [
  { value: 'modified', label: 'Last Modified' },
  { value: 'created', label: 'Created' },
  { value: 'name', label: 'Name' },
]

const CharacterList: Component = () => {
  setComponentPageTitle('Matches')

  const [query, setQuery] = useSearchParams()

  const state = characterStore((s) => ({ ...s.characters, loading: s.loading }))

  const cached = getListCache()
  const [view, setView] = createSignal(cached.view || 'list')
  const [sortField, setSortField] = createSignal(cached.sort.field)
  const [sortDirection, setSortDirection] = createSignal(cached.sort.direction)
  const [search, setSearch] = createSignal('')
  const [showImport, setImport] = createSignal(false)
  const user = userStore()
  const [importPath, setImportPath] = createSignal<string | undefined>(query.import)
  const importQueue: NewCharacter[] = []

  const onImport = (chars: NewCharacter[]) => {
    importQueue.push(...chars)
    dequeue()
    setImport(false)
    setImportPath()
    setQuery({ import: undefined })
  }

  const dequeue = () => {
    const char = importQueue.shift()
    if (!char) return
    characterStore.createCharacter(char, dequeue)
  }

  const getNextView = () => (view() === 'list' ? 'cards' : 'list')

  onMount(() => {
    characterStore.getCharacters()
  })

  createEffect(() => {
    tagStore.updateTags(state.list)
  })

  createEffect(() => {
    const next = {
      view: view(),
      sort: {
        field: sortField(),
        direction: sortDirection(),
      },
    }

    saveListCache(next)
  })

  return (
    <>
      <PageHeader
        title={
          <div class="flex w-full justify-between">
            <div>Matches</div>
            <Show when={user.user._id !== 'anon'}>
              <div class="flex text-base">
                <div class="px-1">
                  <Button onClick={() => setImport(true)}>
                    <Import />
                    <span class="hidden sm:inline">Import</span>
                  </Button>
                </div>
                <div class="px-1">
                  <A href="/character/create">
                    <Button>
                      <Plus />
                      <span class="hidden sm:inline">Create</span>
                    </Button>
                  </A>
                </div>
              </div>
            </Show>
          </div>
        }
      />

      <div class="mb-2 flex justify-between">
        <div class="flex flex-wrap">
          <div class="m-1 ml-0 mr-1">
            <TextInput
              fieldName="search"
              placeholder="Search by name..."
              onKeyUp={(ev) => setSearch(ev.currentTarget.value)}
            />
          </div>

          <div class="flex flex-wrap">
            <Select
              class="m-1 ml-0 bg-[var(--bg-600)]"
              fieldName="sortBy"
              items={sortOptions}
              value={sortField()}
              onChange={(next) => setSortField(next.value as SortFieldTypes)}
            />

            <div class="mr-1 py-1">
              <Button
                schema="secondary"
                class="rounded-xl"
                onClick={() => {
                  const next = sortDirection() === 'asc' ? 'desc' : 'asc'
                  setSortDirection(next)
                }}
              >
                {sortDirection() === 'asc' ? <SortAsc /> : <SortDesc />}
              </Button>
            </div>
          </div>
          <TagSelect class="m-1" />
        </div>

        <div class="flex flex-wrap">
          <div class="py-1">
            <Button schema="secondary" onClick={() => setView(getNextView())}>
              <Switch>
                <Match when={getNextView() === 'list'}>
                  <span class="hidden sm:block">List View</span> <LayoutList />
                </Match>
                <Match when={getNextView() === 'cards'}>
                  <span class="hidden sm:block">Cards View</span> <Image />
                </Match>
              </Switch>
            </Button>
          </div>
        </div>
      </div>

      <Characters
        characters={state.list}
        loading={state.loading || false}
        loaded={state.loaded}
        type={view()}
        user={user}
        filter={search()}
        sortField={sortField()}
        sortDirection={sortDirection()}
      />
      <ImportCharacterModal
        charhubPath={importPath()}
        show={showImport() || !!importPath()}
        close={() => setImport(false)}
        onSave={onImport}
      />
    </>
  )
}

const Characters: Component<{
  characters: AppSchema.Character[]
  loading: boolean
  loaded: boolean
  type: ViewTypes
  filter: string
  user: AppSchema.User
  sortField: SortFieldTypes
  sortDirection: SortDirectionTypes
}> = (props) => {
  const tags = tagStore((s) => ({ filter: s.filter, hidden: s.hidden }))
  const [showGrouping, setShowGrouping] = createSignal(false)
  const groups = createMemo(() => {
    const list = props.characters
      .slice()
      .filter((ch) => ch.name.toLowerCase().includes(props.filter.toLowerCase()))
      .filter((ch) => tags.filter.length === 0 || ch.tags?.some((t) => tags.filter.includes(t)))
      .filter((ch) => !ch.tags || !ch.tags.some((t) => tags.hidden.includes(t)))
      .sort(getSortFunction(props.sortField, props.sortDirection))

    const groups = [
      { label: 'Favorites', list: list.filter((c) => c.favorite) },
      { label: '', list: list.filter((c) => !c.favorite) },
    ]
    if (groups[0].list.length === 0) {
      setShowGrouping(false)
      return [groups[1]]
    }
    setShowGrouping(true)
    return groups
  })

  const toggleFavorite = (charId: string, favorite: boolean) => {
    characterStore.setFavorite(charId, favorite)
  }

  const [showDelete, setDelete] = createSignal<AppSchema.Character>()
  const [download, setDownload] = createSignal<AppSchema.Character>()
  return (
    <>
      <Switch fallback={<div>Failed to load characters. Refresh to try again.</div>}>
        <Match when={props.loading}>
          <div class="flex justify-center">
            <Loading />
          </div>
        </Match>
        <Match when={props.characters.length === 0 && props.loaded}>
          <NoCharacters />
        </Match>
        <Match when={props.loaded}>
          <Show when={props.user.user?._id === 'anon'}>
            <div class="gap-2 p-4 text-lg font-bold">
              You are not <a href="/login">registered</a>. You can only chat with the helpdesk bot.
            </div>
          </Show>
          <Show when={props.user.user?._id !== 'anon'}>
            <Show when={!props.type || props.type === 'list'}>
              <div class="flex w-full flex-col gap-2 pb-5">
                <For each={groups()}>
                  {(group) => (
                    <>
                      <Show when={showGrouping() && group.label}>
                        <h2 class="text-xl font-bold">{group.label}</h2>
                      </Show>
                      <For each={group.list}>
                        {(char) => (
                          <Character
                            type={props.type}
                            char={char}
                            user={props.user}
                            delete={() => setDelete(char)}
                            download={() => setDownload(char)}
                            toggleFavorite={(value) => toggleFavorite(char._id, value)}
                          />
                        )}
                      </For>
                      <Divider />
                    </>
                  )}
                </For>
              </div>
            </Show>

            <Show when={props.type === 'cards'}>
              <For each={groups()}>
                {(group) => (
                  <>
                    <Show when={showGrouping()}>
                      <h2 class="text-xl font-bold">{group.label}</h2>
                    </Show>
                    <div class="grid w-full grid-cols-[repeat(auto-fit,minmax(160px,1fr))] flex-row flex-wrap justify-start gap-2 py-2 md:gap-4">
                      <For each={group.list}>
                        {(char) => (
                          <Character
                            type={props.type}
                            char={char}
                            user={props.user}
                            delete={() => setDelete(char)}
                            download={() => setDownload(char)}
                            toggleFavorite={(value) => toggleFavorite(char._id, value)}
                          />
                        )}
                      </For>
                      <Show when={group.list.length < 4}>
                        <For each={new Array(4 - group.list.length)}>{() => <div></div>}</For>
                      </Show>
                    </div>
                    <Divider />
                  </>
                )}
              </For>
            </Show>
          </Show>
        </Match>
      </Switch>

      <Show when={download()}>
        <DownloadModal show close={() => setDownload()} char={download()!} />
      </Show>
      <DeleteCharacterModal
        char={showDelete()}
        show={!!showDelete()}
        close={() => setDelete(undefined)}
      />
    </>
  )
}

const Character: Component<{
  type: string
  char: AppSchema.Character
  user: AppSchema.User
  delete: () => void
  download: () => void
  toggleFavorite: (value: boolean) => void
}> = (props) => {
  const [opts, setOpts] = createSignal(false)
  const [listOpts, setListOpts] = createSignal(false)
  const nav = useNavigate()

  if (props.type === 'list') {
    return (
      <div class="bg-800 flex w-full flex-row items-center justify-between gap-4 rounded-xl px-2 py-1 hover:bg-[var(--bg-700)]">
        <A
          class="ellipsis flex h-3/4 grow cursor-pointer items-center gap-4"
          href={`/character/${props.char._id}/chats`}
        >
          <CharacterAvatar char={props.char} zoom={1.75} />
          <div class="flex max-w-full flex-col overflow-hidden">
            <span class="ellipsis font-bold">{props.char.name}</span>
            <span class="ellipsis">{props.char.description}</span>
          </div>
        </A>
        <div>
          <div class="hidden flex-row items-center justify-center gap-2 sm:flex">
            <Show when={props.char.name !== 'Aiva' && props.char?.parent}>
              <Gauge showBar={false} currentXP={props.char.xp} />
            </Show>
            <Show when={props.char.favorite}>
              <Star
                class="icon-button fill-[var(--text-900)] text-[var(--text-900)]"
                onClick={() => props.toggleFavorite(false)}
              />
            </Show>
            <Show when={!props.char.favorite}>
              <Star class="icon-button" onClick={() => props.toggleFavorite(true)} />
            </Show>
            <Show when={!props.char?.parent && props.char?.name !== 'Aiva'}>
              <A href={`/chats/create/${props.char._id}`}>
                <MessageCircle class="icon-button" />
              </A>
              <a onClick={props.download}>
                <Download class="icon-button" />
              </a>
              <A href={`/character/${props.char._id}/edit`}>
                <Edit class="icon-button" />
              </A>
              <A href={`/character/create/${props.char._id}`}>
                <Copy class="icon-button" />
              </A>
            </Show>
            <Show when={props.char?.name !== 'Aiva'}>
              <Trash class="icon-button" onClick={props.delete} />
            </Show>
            <Show when={props.char?.parent}>
              <User class="icon-button" onClick={() => nav(`/likes/${props.char._id}/profile`)} />
            </Show>
          </div>
          <div class="flex items-center sm:hidden" onClick={() => setListOpts(true)}>
            <Show when={props.char.name !== 'Aiva' && props.char?.parent}>
              <Gauge showBar={false} currentXP={props.char.xp} />
            </Show>
            <MoreHorizontal class="icon-button" />
          </div>
          <DropMenu
            class="bg-[var(--bg-700)]"
            show={listOpts()}
            close={() => setListOpts(false)}
            customPosition="right-[10px] top-[4px]"
            // horz="left"
            vert="down"
          >
            <div class="flex flex-col gap-2 p-2 font-bold">
              <Button onClick={() => props.toggleFavorite(!props.char.favorite)} size="sm">
                <Show when={props.char.favorite}>
                  <Star class="text-900 fill-[var(--text-900)]" /> Unfavorite
                </Show>
                <Show when={!props.char.favorite}>
                  <Star /> Favorite
                </Show>
              </Button>
              <Button onClick={() => nav(`/chats/create/${props.char._id}`)} alignLeft size="sm">
                <MessageCircle /> Chat
              </Button>
              <Show when={!props.char?.parent && props.char?.name !== 'Aiva'}>
                <Button alignLeft onClick={props.download} size="sm">
                  <Download /> Download
                </Button>
                <Button
                  alignLeft
                  onClick={() => nav(`/character/${props.char._id}/edit`)}
                  size="sm"
                >
                  <Edit /> Edit
                </Button>
                <Button
                  alignLeft
                  onClick={() => nav(`/character/create/${props.char._id}`)}
                  size="sm"
                >
                  <Copy /> Duplicate
                </Button>
              </Show>
              <Button alignLeft schema="red" onClick={props.delete} size="sm">
                <Trash /> Delete
              </Button>
              <Show when={props.char?.parent && props.char?.name !== 'Aiva'}>
                <Button alignLeft onClick={() => nav(`/likes/${props.char._id}/profile`)}>
                  <User /> Profile
                </Button>
              </Show>
            </div>
          </DropMenu>
        </div>
      </div>
    )
  }

  let ref: any

  return (
    <div ref={ref} class="bg-800 flex flex-col items-center justify-between gap-1 rounded-md p-1">
      <div class="w-full">
        <Switch>
          <Match when={props.char.visualType === 'sprite' && props.char.sprite}>
            <A
              href={`/character/${props.char._id}/chats`}
              class="block h-44 w-full justify-center overflow-hidden rounded-lg"
            >
              <AvatarContainer container={ref} body={props.char.sprite} />
            </A>
          </Match>
          <Match when={props.char.avatar}>
            <A
              href={`/character/${props.char._id}/chats`}
              class="block h-44 w-full justify-center overflow-hidden rounded-lg"
            >
              <img
                src={getAssetUrl(props.char.avatar!)}
                class="h-full w-full object-cover"
                style="object-position: 50% 30%;"
              />
            </A>
          </Match>
          <Match when>
            <A
              href={`/character/${props.char._id}/chats`}
              class="bg-700 flex h-32 w-full items-center justify-center rounded-md"
            >
              <VenetianMask size={24} />
            </A>
          </Match>
        </Switch>
      </div>
      <div class="h-18 w-full text-sm">
        <div class="relative right-0 w-full px-2 text-right text-2xl text-white text-shadow md:right-1 overflow-x-hidden overflow-y-hidden h-8">
          <span class=" font-black ">{props.char?.name}</span>{' '}
          {props.char.persona?.attributes?.age
            ? props.char?.persona?.attributes?.age[0].split(' ')[0]
            : ''}
        </div>
        <div class="-mt-2 h-12 px-2">
          <Show when={props.char?.parent && props.char?.name !== 'Aiva'}>
            <div>
              <Gauge showBar={true} currentXP={props.char.xp} />
            </div>
          </Show>
        </div>

        {/* hacky positioning shenanigans are necessary as opposed to using an
            absolute positioning because if any of the DropMenu parent is
            positioned, then DropMenu breaks because it relies on the nearest
            positioned parent to be the sitewide container */}
        <div
          class="float-right mr-[4px] mt-[-248px] flex justify-end"
          onClick={() => setOpts(true)}
          >
          <div class="rounded-md bg-[var(--bg-500)] p-[2px]">
            <Menu size={24} class="icon-button" color="var(--bg-100)" />
          </div>
          <DropMenu
            show={opts()}
            close={() => setOpts(false)}
            customPosition="right-[9px] top-[6px]"
          >
            <div class="flex flex-col gap-2 p-2">
              <Button
                onClick={() => props.toggleFavorite(!props.char.favorite)}
                size="sm"
                alignLeft
              >
                <Show when={props.char.favorite}>
                  <Star class="text-900 fill-[var(--text-900)]" /> Unfavorite
                </Show>
                <Show when={!props.char.favorite}>
                  <Star /> Favorite
                </Show>
              </Button>
              <Button onClick={() => nav(`/chats/create/${props.char._id}`)} alignLeft size="sm">
                <MessageCircle /> Chat
              </Button>
              <Show when={!props.char?.parent && props.char?.name !== 'Aiva'}>
                <Button
                  alignLeft
                  size="sm"
                  onClick={() => {
                    setOpts(false)
                    props.download()
                  }}
                >
                  <Download /> Download
                </Button>
                <Button
                  alignLeft
                  onClick={() => nav(`/character/${props.char._id}/edit`)}
                  size="sm"
                >
                  <Edit /> Edit
                </Button>
                <Button
                  alignLeft
                  onClick={() => nav(`/character/create/${props.char._id}`)}
                  size="sm"
                >
                  <Copy /> Duplicate
                </Button>
              </Show>
              <Button
                alignLeft
                size="sm"
                schema="red"
                onClick={() => {
                  setOpts(false)
                  props.delete()
                }}
              >
                <Trash /> Delete
              </Button>
              <Show when={props.char?.parent}>
                <Button alignLeft onClick={() => nav(`/likes/${props.char._id}/profile`)}>
                  <User /> Profile
                </Button>
              </Show>
            </div>
          </DropMenu>
        </div>
      </div>
    </div>
  )
}

function getSortableValue(char: AppSchema.Character, field: SortFieldTypes) {
  switch (field) {
    case 'name':
      return char.name.toLowerCase()
    case 'created':
      return char.createdAt
    case 'modified':
      return char.updatedAt
    default:
      return 0
  }
}

function getSortFunction(field: SortFieldTypes, direction: SortDirectionTypes) {
  return (left: AppSchema.Character, right: AppSchema.Character) => {
    const mod = direction === 'asc' ? 1 : -1
    const l = getSortableValue(left, field)
    const r = getSortableValue(right, field)
    return l > r ? mod : l === r ? 0 : -mod
  }
}

function getListCache(): ListCache {
  const existing = storage.localGetItem(CACHE_KEY)
  const defaultCache: ListCache = { sort: { field: 'modified', direction: 'desc' }, view: 'list' }

  if (!existing) {
    return defaultCache
  }

  return { ...defaultCache, ...JSON.parse(existing) }
}

function saveListCache(cache: ListCache) {
  storage.localSetItem(CACHE_KEY, JSON.stringify(cache))
}

const NoCharacters: Component = () => (
  <div class="mt-16 flex w-full justify-center rounded-full text-xl">
    You have no characters!&nbsp;
  </div>
)

export default CharacterList
