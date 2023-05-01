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
import PageHeader from '../../shared/PageHeader'
import Select, { Option } from '../../shared/Select'
import TextInput from '../../shared/TextInput'
import { AppSchema } from '../../../srv/db/schema'
import {
  Copy,
  Download,
  Edit,
  Menu,
  Save,
  Trash,
  VenetianMask,
  X,
  Import,
  Plus,
  Star,
  SortAsc,
  SortDesc,
  LayoutList,
  Image,
  User,
} from 'lucide-solid'
import { A, useNavigate } from '@solidjs/router'
import AvatarIcon from '../../shared/AvatarIcon'
import ImportCharacterModal from '../Character/ImportCharacter'
import DeleteCharacterModal from '../Character/DeleteCharacter'
import { getAssetUrl, setComponentPageTitle } from '../../shared/util'
import { DropMenu } from '../../shared/DropMenu'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import { exportCharacter } from '../../../common/prompt'
import Loading from '../../shared/Loading'
import Divider from '../../shared/Divider'
import Gauge from '../../shared/Gauge'

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

  const cached = getListCache()
  const [view, setView] = createSignal(cached.view)
  const [sortField, setSortField] = createSignal(cached.sort.field)
  const [sortDirection, setSortDirection] = createSignal(cached.sort.direction)
  const [search, setSearch] = createSignal('')
  const [showImport, setImport] = createSignal(false)
  const user = userStore()

  const onImport = (char: NewCharacter) => {
    characterStore.createCharacter(char, () => setImport(false))
  }

  const getNextView = () => (view() === 'list' ? 'cards' : 'list')

  onMount(() => {
    characterStore.getCharacters()
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
            <div class="flex text-base">
              <Show when={user.user.admin}>
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
              </Show>
            </div>
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

            <div class="py-1">
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
        type={view()}
        user={user}
        filter={search()}
        sortField={sortField()}
        sortDirection={sortDirection()}
      />
      <ImportCharacterModal show={showImport()} close={() => setImport(false)} onSave={onImport} />
    </>
  )
}

const Characters: Component<{
  type: ViewTypes
  filter: string
  user: AppSchema.User
  sortField: SortFieldTypes
  sortDirection: SortDirectionTypes
}> = (props) => {
  const state = characterStore((s) => ({ ...s.characters, loading: s.loading }))

  const [showGrouping, setShowGrouping] = createSignal(false)
  const groups = createMemo(() => {
    const list = state.list
      .slice()
      .filter((ch) => ch.name.toLowerCase().includes(props.filter.toLowerCase()))
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
        <Match when={state.loading}>
          <div class="flex justify-center">
            <Loading />
          </div>
        </Match>
        <Match when={state.list.length === 0 && state.loaded}>
          <NoCharacters />
        </Match>
        <Match when={state.loaded}>
          <Show when={props.user.user._id === 'anon'}>
            <div class="gap-2 p-4 text-lg font-bold">
              You are not <a href="/login">registered</a>. You can only chat with the helpdesk bot.
            </div>
          </Show>

          <Show when={props.type === 'list'}>
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
                  <div class="grid w-full grid-cols-[repeat(auto-fit,minmax(160px,1fr))] flex-row flex-wrap justify-start gap-2 md:gap-4 py-2">
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
        </Match>
      </Switch>

      <DownloadModal show={!!download()} close={() => setDownload()} char={download()} />
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
      <div class="flex w-full flex-row items-center justify-between gap-4 rounded-xl bg-[var(--bg-700)] py-1 px-2">
        <A
          class="ellipsis flex h-3/4 cursor-pointer items-center"
          href={`/character/${props.char._id}/chats`}
        >
          <AvatarIcon avatarUrl={props.char.avatar} class="mr-4" />
          <div class="ellipsis flex w-full flex-col">
            <div class="font-bold">{props.char.name}</div>
            <div class="">{props.char.description}</div>
          </div>
        </A>
        <div>
          <div class="hidden flex-row items-center justify-center gap-2 sm:flex">
            <Gauge showBar={false} currentXP={props.char.xp} />
            <Show when={props.char.favorite}>
              <Star
                class="icon-button fill-[var(--text-900)] text-[var(--text-900)]"
                onClick={() => props.toggleFavorite(false)}
              />
            </Show>
            <Show when={!props.char.favorite}>
              <Star class="icon-button" onClick={() => props.toggleFavorite(true)} />
            </Show>
            <Show when={props.user.user.admin}>
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
            <Trash class="icon-button" onClick={props.delete} />
            <User class="icon-button" onClick={() => nav(`/likes/${props.char._id}/profile`)} />
          </div>
          <div class="flex items-center sm:hidden" onClick={() => setListOpts(true)}>
            <Menu class="icon-button" />
          </div>
          <DropMenu
            class="bg-[var(--bg-700)]"
            show={listOpts()}
            close={() => setListOpts(false)}
            customPosition="right-[10px]"
            // horz="left"
            vert="down"
          >
            <div class="flex flex-col gap-2 p-2 font-bold">
              <Button onClick={() => props.toggleFavorite(!props.char.favorite)}>
                <Show when={props.char.favorite}>
                  <Star class="text-900 fill-[var(--text-900)]" /> Unfavorite
                </Show>
                <Show when={!props.char.favorite}>
                  <Star /> Favorite
                </Show>
              </Button>
              <Show when={props.user?.user?.admin}>
                <Button alignLeft onClick={props.download}>
                  <Download /> Download
                </Button>
                <Button alignLeft onClick={() => nav(`/character/${props.char._id}/edit`)}>
                  <Edit /> Edit
                </Button>
                <Button alignLeft onClick={() => nav(`/character/create/${props.char._id}`)}>
                  <Copy /> Duplicate
                </Button>
              </Show>
              <Button alignLeft onClick={props.delete}>
                <Trash /> Delete
              </Button>
              <Button alignLeft onClick={() => nav(`/likes/${props.char._id}/profile`)}>
                <User /> Profile
              </Button>
            </div>
          </DropMenu>
        </div>
      </div>
    )
  }

  return (
    <div class="flex flex-col items-center justify-between gap-1 rounded-md bg-[var(--bg-800)] p-1">
      <div class="w-full">
        <Show when={props.char.avatar}>
          <A
            href={`/character/${props.char._id}/chats`}
            class="block h-56 w-full justify-center overflow-hidden rounded-lg "
          >
            <img
              src={getAssetUrl(props.char.avatar!)}
              class="h-full w-full object-cover"
              style="object-position: 50% 30%;"
            />
          </A>
        </Show>
        <Show when={!props.char.avatar}>
          <A
            href={`/character/${props.char._id}/chats`}
            class="flex h-56 w-full items-center justify-center rounded-md bg-[var(--bg-800)]"
          >
            <VenetianMask size={24} />
          </A>
        </Show>
      </div>
      <div class="w-full text-sm h-18">
        <div class="w-full text-right relative px-2 text-2xl text-white text-shadow right-0 md:right-1">
          <span class=" font-black ">{props.char?.name}</span> {((props.char.persona?.attributes?.age) ? props.char?.persona?.attributes?.age[0].split(" ")[0] : '')}
        </div>
        <div class="px-3 h-16 -mt-5">
          <Show when={props.char.name!=="Aiva"}>
              <div ><Gauge showBar={true} currentXP={props.char.xp} /></div>
          </Show>
        </div>

        {/* hacky positioning shenanigans are necessary as opposed to using an
            absolute positioning because if any of the DropMenu parent is
            positioned, then DropMenu breaks because it relies on the nearest
            positioned parent to be the sitewide container */}
        <div
          class="-mt-[300px] float-right mr-1 flex justify-end"
          onClick={() => setOpts(true)}
        >
          <div class=" rounded-md bg-[var(--bg-500)] p-[2px]">
            <Menu size={24} class="icon-button" color="var(--bg-100)" />
          </div>
          <DropMenu
            show={opts()}
            close={() => setOpts(false)}
            customPosition="right-[9px] top-[6px]"
          >
            <div class="flex flex-col gap-2 p-2">
              <Button onClick={() => props.toggleFavorite(!props.char.favorite)}>
                <Show when={props.char.favorite}>
                  <Star class="text-900 fill-[var(--text-900)]" /> Unfavorite
                </Show>
                <Show when={!props.char.favorite}>
                  <Star /> Favorite
                </Show>
              </Button>
              <Button alignLeft onClick={() => nav(`/likes/${props.char._id}/profile`)}>
                <User /> Profile
              </Button>
              <Show when={props.user?.user?.admin}>
                <Button alignLeft onClick={props.download}>
                  <Download /> Download
                </Button>
                <Button alignLeft onClick={() => nav(`/character/${props.char._id}/edit`)}>
                  <Edit /> Edit
                </Button>
                <Button alignLeft onClick={() => nav(`/character/create/${props.char._id}`)}>
                  <Copy /> Duplicate
                </Button>
              </Show>
              <Button alignLeft onClick={props.delete}>
                <Trash /> Delete
              </Button>
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
  const existing = localStorage.getItem(CACHE_KEY)
  const defaultCache: ListCache = { sort: { field: 'modified', direction: 'desc' }, view: 'list' }

  if (!existing) {
    return defaultCache
  }

  return { ...defaultCache, ...JSON.parse(existing) }
}

function saveListCache(cache: ListCache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

const plainFormats = [{ value: 'text', label: 'Plain Text' }]

const formats = [
  { value: 'boostyle', label: 'Boostyle' },
  { value: 'wpp', label: 'W++' },
  { value: 'sbf', label: 'Square Bracket Format' },
]

/**
 * WIP: Enable downloading characters in different persona formats for different application targets
 */

export const DownloadModal: Component<{
  show: boolean
  close: () => void
  char?: AppSchema.Character
}> = (props) => {
  let ref: any
  const opts = createMemo(
    () => {
      return props.char?.persona.kind === 'text' ? plainFormats : formats
    },
    { equals: false }
  )

  const [format, setFormat] = createSignal('native')
  const [schema, setSchema] = createSignal(opts()[0].value)

  return (
    <Modal
      show={props.show && !!props.char}
      close={props.close}
      title="Download Character"
      footer={
        <Button schema="secondary" onClick={props.close}>
          <X /> Close
        </Button>
      }
    >
      <form ref={ref} class="flex flex-col gap-4">
        <Select
          label="Output Format"
          fieldName="app"
          value={format()}
          items={[
            { value: 'native', label: 'Agnaistic' },
            { value: 'tavern', label: 'TavernAI' },
            { value: 'ooba', label: 'Textgen' },
          ]}
          onChange={(item) => setFormat(item.value)}
        />
        <div class="flex">
          <Select
            label="Persona Format"
            helperText="If exporting to Agnaistic format, this does not matter"
            fieldName="format"
            items={opts()}
            value={schema()}
            onChange={(item) => setSchema(item.value)}
            disabled={format() === 'native'}
          />
        </div>
        <div class="flex w-full justify-center">
          <a
            href={`data:text/json:charset=utf-8,${encodeURIComponent(
              charToJson(props.char!, format(), schema())
            )}`}
            download={`${props.char!.name}.json`}
          >
            <Button>
              <Save />
              Download
            </Button>
          </a>
        </div>
      </form>
    </Modal>
  )
}

function charToJson(char: AppSchema.Character, format: string, schema: string) {
  const { _id, ...json } = char

  const copy = { ...char }
  copy.persona.kind = schema as any

  if (format === 'native') {
    return JSON.stringify(json, null, 2)
  }

  const content = exportCharacter(copy, format as any)
  return JSON.stringify(content, null, 2)
}

const NoCharacters: Component = () => (
  <div class="mt-16 flex w-full justify-center rounded-full text-xl">
    You have no characters!&nbsp;
    <A class="text-[var(--hl-500)]" href="/character/create">
      Create a character
    </A>
    &nbsp;to get started!
  </div>
)

export default CharacterList
