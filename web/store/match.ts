import { AppSchema } from '../../common/types/schema'
import { useNavigate } from '@solidjs/router'
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

      toastStore.success(`Successfully created Match`)
      console.log('this is res', res)

      if (res.error) toastStore.error(`Failed to create Match: ${res.error}`)
      if (res.result) {
        // const props = charsIds().list[charsIds().list.length - 1];
        // console.log(charsIds().list,this.id,charsIds().list[charsIds().list.length - 1],props);
        const charId = res.result._id
        matchStore.getMatches()

        chatStore.createChat(
          charId,
          {
            name: 'First Chat',
            schema: 'wpp',
            useOverrides: false,
            scenarioId: '',
            genPreset: 'horde',
          },
          (res) => {
            chatStore.getChat(res)
            characterStore.getCharacters()
            navi(`/chat/${res}`)
          }
        )
      }
    },
  }
})
