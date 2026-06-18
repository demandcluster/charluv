import { AppSchema } from '../../common/types/schema'
import { api } from './api'
import { createStore } from './create'
import { userStore } from './user'
import { toastStore } from './toasts'
import { data } from './data'
import { chatStore } from './chat'
import { characterStore } from './character'

//import { chatsApi } from './data/chats'
type Matchesstate = {
  Matches: {
    loaded: boolean
    list: AppSchema.Match[]
  }
  discover: {
    loading: boolean
    loaded: boolean
    list: AppSchema.Character[]
  }
}

export type DiscoverFilters = {
  gender?: string
  artStyle?: string
  category?: string
  nsfw?: boolean
  search?: string
  sort?: 'trending' | 'popular' | 'new'
}

export type NewMatch = {
  name: string
  greeting: string
  scenario: string
  sampleChat: string
  avatar?: File
  xp: number
  anime: boolean
  premium: boolean
  description: string
  match: boolean
  persona: AppSchema.CharacterPersona
}

export const matchStore = createStore<Matchesstate>('Match', {
  Matches: { loaded: false, list: [] },
  discover: { loading: false, loaded: false, list: [] },
})((get, set) => {
  return {
    logout() {
      return {
        Matches: { loaded: false, list: [] },
        discover: { loading: false, loaded: false, list: [] },
      }
    },
    discover: async (_, filters: DiscoverFilters = {}) => {
      set({ discover: { ...get().discover, loading: true } })
      const query: Record<string, any> = { sort: filters.sort || 'trending' }
      if (filters.gender) query.gender = filters.gender
      if (filters.artStyle) query.artStyle = filters.artStyle
      if (filters.category) query.category = filters.category
      if (filters.search) query.search = filters.search
      if (filters.nsfw === false) query.nsfw = 'false'

      const res = await api.get('/match/discover', query)
      if (res.error) {
        toastStore.error('Failed to load Discover')
        set({ discover: { ...get().discover, loading: false } })
      } else {
        set({ discover: { loading: false, loaded: true, list: res.result.characters } })
      }
    },
    getMatches: async (_, lastid) => {
      const state = userStore()
      const { ui } = state
      const res = await api.get('/match')
      if (res.error) toastStore.error('Failed to retrieve Matches')
      else {
        if (lastid) {
          const ss = res.result.characters.findIndex((i) => i._id === lastid)
          if (ss) {
            res.result.characters = [
              ...res.result.characters.splice(ss),
              ...res.result.characters.splice(0, ss),
            ]
          }
        }

        return {
          characters: {
            // ids: res.result.characters.map((i) => i._id),
            // ids: res.result.characters,
            list: res.result.characters,
            loaded: true,
          },
        }
      }
    },

    // get match by ID
    getMatch: async (_, id: string) => {
      const res = await api.get('/match')

      if (res.error) toastStore.error('Failed to retrieve Match')
      else {
        const chx = res.result.characters.filter((i) => i._id === id)

        return { characters: { list: chx, loaded: true } }
      }
    },
    createMatch: async (_, char: AppSchema.Character, navi) => {
      const form = new FormData()

      const res = await api.post(`/match/${char._id}`)

      if (res.error) toastStore.error(`Failed to create Match: ${res.error}`)
      else {
        toastStore.success(`Successfully created Match`)

        // const props = charsIds().list[charsIds().list.length - 1];
        // console.log(charsIds().list,this.id,charsIds().list[charsIds().list.length - 1],props);
        const charId = res.result?._id

        navi(`/chats/create/${charId}`)

        return true
      }
      debugger
    },
  }
})
