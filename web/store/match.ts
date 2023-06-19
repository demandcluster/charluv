import { AppSchema } from '../../srv/db/schema'
import { api } from './api'
import { createStore } from './create'
import { userStore } from './user'
import { toastStore } from './toasts'
import { data } from './data'
import { chatsApi } from './data/chats'
type Matchesstate = {
  Matches: {
    loaded: boolean
    list: AppSchema.Match[]
  }
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
})((get, set) => {
  return {
    logout() {
      return { Matches: { loaded: false, list: [] } }
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

        if (ui.charAnime === false) {
          res.result.characters = res.result.characters.filter((i) => i.anime === false)
        }
        if (ui.charRealistic === false) {
          res.result.characters = res.result.characters.filter((i) => i.anime === true)
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
        console.log('chx', id)

        return { characters: { list: chx, loaded: true } }
      }
    },
    createMatch: async (_, char: AppSchema.Character, onSuccess?: () => void) => {
      const form = new FormData()
      form.append('name', char.name)
      form.append('greeting', char.greeting)
      form.append('scenario', char.scenario)
      form.append('persona', JSON.stringify(char.persona))
      form.append('sampleChat', char.sampleChat)
      form.append('xp', 0)
      form.append('premium', char.premium) //.toString()==="true")
      form.append('anime', char.anime)
      form.append('description', char.description)
      form.append('match', 'false')
      form.append('avatar', char.avatar)

      const res = await api.post(`/match/${char._id}`, form)

      if (res.error) toastStore.error(`Failed to create Match: ${res.error}`)
      if (res.result) {

        // const props = charsIds().list[charsIds().list.length - 1];
        // console.log(charsIds().list,this.id,charsIds().list[charsIds().list.length - 1],props);

        return chatsApi.createChat(res.result._id, {
          name: "First Chat",
          schema: "wpp",
          useOverrides:  false,
        }).then((res) => {
          if (res.error) toastStore.error(`Failed to create conversation: ${res.error}`)
          if (res.result) {
            onSuccess?.(`/chat/${res.result._id}`);
          }
        })
        toastStore.success(`Successfully created Match`)
        Matchestore.getMatches()
      }
    },
  }
})
